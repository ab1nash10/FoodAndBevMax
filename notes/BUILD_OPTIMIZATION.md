# Docker build optimisation

Goal: cut the time to build the AAHAR images, one measured change at a time.

## Summary

| Build                                          | Baseline cold / warm | Now cold / warm   | Image size        |
| ---------------------------------------------- | -------------------- | ----------------- | ----------------- |
| Jenkinsfile backend set (3 services + migrate) | 213 s / 72 s         | 82–132 s / 39 s   | unchanged (+8 MB) |
| Backend `SERVICE=all` (dev cluster, FANDB-API) | 80 s / 57 s          | 62–94 s / 34–45 s | unchanged         |
| Portal (FANDB-UI, Jenkinsfile)                 | 136 s / 61 s         | 83 s / 36 s       | unchanged         |

- **What changed:** the backend workspace is installed and compiled once for all four
  backend images, turbo is installed once into a cached layer, and the Prisma client is
  generated before the source is copied. Three commits, Dockerfiles only.
- **What the numbers mean:** the cold totals here are dominated by the dependency download,
  which took 22–56 s for the same backend install and 35–64 s for the same portal install
  on different runs, so the ranges are wide. The
  steps each change removes are measured exactly: three installs and compiles become one
  (the user, organization and migrate builds now take 3–6 s), the prune drops from
  6.5–8.8 s to 0.3 s, and `prisma generate` (4.8–8.0 s) is cached on code changes.
- **Checked:** all six images were built with the Jenkinsfile's exact commands on Docker's
  default builder and rehearsed: the migrate and seed hooks (seed twice), the three
  services and the portal behind nginx with the chart's path rules (`scripts/smoke.sh` all
  passed, password sign-in and ten pages in a browser with no errors), and the
  `SERVICE=all` image applying migrations and the seed at startup, then healthy, signed in,
  and six APIs answering 200.

## Build setup (step 0)

- **Images:** two Dockerfiles, both built from the repository root.
  - `frontend/Dockerfile`: the admin portal.
  - `backend/Dockerfile`: one per NestJS service, `SERVICE=all` for all three in one image, or
    `--target migrate` for the Prisma tooling image.
  - Both are multi-stage and use `turbo prune --docker`. `.dockerignore` already excludes
    `.git`, every `node_modules`, `.next`, `dist`, `.turbo` and `.env` files.
- **Registry:** Amazon ECR, the single repository `max-ai-repo` in ap-south-1, with the image
  name as a tag prefix (`admin-portal-<sha>`, `auth-service-<sha>`, …).
- **What builds them:**
  - The **dev cluster** is built by the shared platform Jenkins (KIOSK-DIGITAL-JENKINS). Its
    jobs are `Max-AI/FANDB-API`, which builds `backend/Dockerfile` with `SERVICE=all`, and
    `Max-AI/FANDB-UI`, which builds `frontend/Dockerfile`. Their configuration lives on that
    Jenkins box, not in this repository.
  - The repository's own **`Jenkinsfile`** builds five images per commit: the portal in
    parallel with the backend set, which is auth, user and organization services one after
    another, then `migrate`. It pushes to ECR and deploys with the Helm chart.
  - **`backend/buildspec.yml` and `frontend/buildspec.yml`** are CodeBuild specs for the
    raw-manifest path (namespace `aahar`), which is reference only. No CodePipeline, CDK or
    Terraform is in the repository; the only CloudFormation template is the ElastiCache one.
- **So both Dockerfiles matter**, whichever Jenkins builds them.

## How it is measured

- **Where:** Docker Desktop on the development machine, using an isolated BuildKit builder
  (`docker buildx`, docker-container driver) so its cache can be emptied without touching
  the default one. Builds run from a clean checkout of the branch (no `node_modules`, no
  local files), as a CI agent sees it.
- **Cold:** the builder's cache is emptied first, so the base image is pulled too, as on a
  fresh agent or a CodeBuild run without local cache.
- **Warm:** the cache from the cold build is kept and one source file is changed, as in a
  normal commit: `components/breadcrumbs.tsx` for the portal, organization-service
  `health.controller.ts` for the backend.
- **Size:** the uncompressed image size from `docker image inspect`.
- **Caveat:** timings on this machine vary by up to about 20 % between runs (background
  load), so small differences are noise. Each change is judged on its large effects and on
  the steps it removes.

## Results

| Iteration | Change                                                             | Build                                         | Cold       | Warm       | Image size                              |
| --------- | ------------------------------------------------------------------ | --------------------------------------------- | ---------- | ---------- | --------------------------------------- |
| 0         | baseline (commit f51ad4b)                                          | portal (FANDB-UI, Jenkinsfile)                | 135.8 s    | 60.9 s     | 338 MB                                  |
| 0         | baseline                                                           | backend `SERVICE=all` (FANDB-API)             | 80.4 s     | 56.8 s     | 1,138 MB                                |
| 0         | baseline                                                           | Jenkinsfile backend set: 3 services + migrate | 213.0 s    | 71.7 s     | 1,130–1,135 MB; migrate 1,156 MB        |
| 1         | backend: one shared prune, install and compile for every `SERVICE` | backend `SERVICE=all`                         | 62.5 s     | 44.8 s     | 1,138 MB (unchanged)                    |
| 1         | (same)                                                             | Jenkinsfile backend set: 3 services + migrate | **81.5 s** | **54.8 s** | 1,138 MB each (+8 MB); migrate 1,157 MB |
| 2         | both: turbo installed once in a cached `tools` stage               | portal                                        | 83.0 s     | 35.6 s     | 338 MB (unchanged)                      |
| 2         | (same)                                                             | backend `SERVICE=all`                         | 93.9 s     | 34.0 s     | 1,138 MB (unchanged)                    |
| 2         | (same)                                                             | Jenkinsfile backend set: 3 services + migrate | 89.6 s     | 58.2 s     | unchanged                               |
| 3         | backend: `prisma generate` before the source copy                  | backend `SERVICE=all`                         | 83.8 s     | 40.9 s     | 1,138 MB (unchanged)                    |
| 3         | (same)                                                             | Jenkinsfile backend set: 3 services + migrate | 131.9 s    | **38.8 s** | unchanged                               |

The Jenkinsfile's total is the portal running in parallel with the backend set, so about
213 s cold and 72 s warm at the baseline.

### Iteration 1: one backend workspace for every image

- **Change:** the backend Dockerfile pruned the workspace to the requested `SERVICE`, so the
  Jenkinsfile's four backend builds each pruned, installed and compiled their own copy
  (auth 69 s, user 77 s, organization 60 s cold). The prune now always takes all three
  services, and `SERVICE` is kept out of scope until after it: a build arg in scope is part
  of every later `RUN`'s cache key, which is also why an unused `ARG SERVICE` in the build
  stage had to go. `SERVICE` is still checked before anything is installed (a bad value
  fails with the same message), and it still decides which service the image runs.
- **Result:** the first backend image does the install and compile; the other three reuse
  them and take 3–6 s each (cold set 213 → 81.5 s, warm 71.7 → 54.8 s). `SERVICE=all` was
  already pruned this way, so its numbers only move by this machine's noise.
- **Cost:** each single-service image now also carries the other two services' compiled
  code, 8 MB in a 1.1 GB image. Nothing runs it.

### Iteration 2: turbo installed once

- **Change:** the prune ran `pnpm dlx turbo@2.9.16`, which downloads turbo (and pnpm
  itself, through corepack) inside the step, and that step follows `COPY . .`, so every
  source change downloaded them again. A `tools` stage now installs the same turbo 2.9.16
  once into a cached layer, and the prune calls it directly, so the prune no longer needs
  pnpm at all. Only the prune stage builds on `tools`; the runtime and migrate images do not
  carry turbo. The context check before the prune is untouched, so building from the wrong
  directory still fails with the same explanation.
- **Result:** the prune step drops from 6.5–8.8 s to 0.3 s on every warm build (portal
  7.2 → 0.5 s), per image. On a cold build the one-off turbo install (about 8 s) costs what
  `dlx` cost before. The totals in the table moved more than that, in both directions,
  because the dependency download (24–46 s for the same install) and the compile vary from
  run to run on this machine; the step times are the measurement that isolates the change.

### Iteration 3: Prisma client generated before the source is copied

- **Change:** the backend build stage copied the whole source, then ran `prisma generate`,
  so any code change generated the client again although it depends only on `prisma/`. The
  stage now copies `prisma/` and `prisma.config.mjs`, generates (the client lands in
  `node_modules`, which the source copy does not touch), and only then copies the source.
- **Result:** on warm builds `prisma generate` is cached instead of taking 4.8–8.0 s, and the
  services still compile against the generated client (a missing client fails the
  compile). The warm Jenkinsfile set is 38.8 s, against 71.7 s at the baseline. This run's
  cold numbers include a 56 s download for an install that took 24 s in iteration 1.

### Iteration 4 (measured, not applied): production-only dependencies in the backend images

- **What it would save:** in the image, `node_modules` is 663 MB. A production-only reinstall
  from the build stage's local pnpm store (offline, about 2 s) brings it to 441 MB, taking
  each backend image from about 1.14 GB to about 0.92 GB. What goes is build tooling: turbo
  (40 MB), the Vite/rolldown, SWC, lightningcss and esbuild native binaries, Prettier,
  webpack and the Nest CLI, ESLint, Vitest. The Prisma CLI stack (`prisma`, Prisma Studio,
  PGlite, `effect`, about 140 MB) stays either way, because `@prisma/client` pulls it in.
- **Why it is not applied:**
  - It makes builds slower, not faster: one more step (2–3 s) on every code change. The gain
    is in pushing and pulling the images, not in building them.
  - The `SERVICE=all` image runs `prisma migrate deploy` and the seed (with `tsx`) at
    startup, and both are root `devDependencies` today. Keeping that working means moving
    `prisma` and `tsx` into `dependencies` in `package.json` and updating the lockfile.
  - The reinstall needs workarounds inside the build: pnpm wants to confirm wiping
    `node_modules` (`--config.confirmModulesPurge=false`), keeps orphaned packages for a
    week unless told otherwise (`--config.modules-cache-max-age=0`), and runs the root
    `prepare` script (`husky`, a dev tool that is no longer there).
- **If you want it:** apply it to the single-service images first (the Helm chart runs
  migrations from the separate `migrate` image, which keeps the full set), then to
  `SERVICE=all` once `prisma` and `tsx` are dependencies.

## Where the baseline time goes

| Build             | Slowest steps                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Portal, cold      | `pnpm install` 64 s; `pnpm -r build` (Next) 46 s; base image pull 10 s; `pnpm dlx turbo prune` 6.5 s     |
| Portal, warm      | `pnpm -r build` 49 s (Next builds from scratch every time); turbo prune 7 s; install cached              |
| Backend all, cold | `pnpm install` 24 s; `pnpm -r build` 21 s; base image pull 12 s; turbo prune 7 s; `prisma generate` 3 s  |
| Backend all, warm | `pnpm -r build` 37 s; turbo prune 5 s; `prisma generate` 5 s (reruns although the schema did not change) |
| Jenkinsfile set   | a separate `pnpm install` of about 24 s for each of the three services, from the network every time      |

## Findings, in the brief's order

- **(a) Layer order:** already right. `turbo prune --docker` copies the manifests and installs
  before the source, and the warm builds show the install layer cached. One leak:
  `prisma generate` runs after the full source copy, so any code change reruns it (3–7 s)
  though it depends only on `prisma/`.
- **(b) .dockerignore:** already tight; the build context loads in 0.2–2.7 s. Little to gain.
- **(c) Multi-stage:** present, but the backend runtime stage copies the builder's whole
  `node_modules`, development tools included, so every backend image is about 1.13 GB. A
  production-only dependency set would shrink it, which speeds up the ECR push and every
  pod's pull. Care is needed: `SERVICE=all` runs `prisma migrate deploy` at startup, and
  `migrate` needs the Prisma CLI.
- **(d) Base image:** already `node:24-alpine`. A cold pull from Docker Hub costs 10–12 s;
  pinning the digest and pulling through an ECR pull-through cache would avoid both the
  pull time and Docker Hub rate limits. That needs an ECR rule in AWS, outside this
  repository.
- **Other waste seen:**
  - Every build downloads turbo again (`pnpm dlx`, 5–7 s), because it runs after
    `COPY . .`.
  - No pnpm store survives between builds. The three service builds each install their
    dependencies from the network; a BuildKit cache mount would let the second and third
    reuse the first.
  - The Next build has no cache between builds.

## Not done, and why

- **BuildKit cache mounts** (`RUN --mount=type=cache` for the pnpm store and the Next build
  cache) would make a dependency change reuse the downloads and the Next compile
  incremental. They are not used because the Docker version on the Jenkins agents,
  including the shared platform Jenkins that builds the dev cluster, is not known: on the
  legacy builder `--mount` is a syntax error and every build would fail. Once the agents
  are confirmed to run BuildKit (Docker 23 or later builds with it by default), this is the
  next change to make.
- **Base image (d):** `node:24-alpine` is already small. Two steps would help, both outside
  the Dockerfile's control: an ECR pull-through cache rule for Docker Hub (avoids the
  10–12 s pull on a fresh agent and Docker Hub's rate limits, but needs the rule and
  credentials in AWS and the `FROM` lines pointing at it), and pinning the image by digest
  (stops an upstream update to `node:24-alpine` from silently forcing a full rebuild, at
  the cost of bumping the digest by hand for security updates).
- **Next's type check during `next build`** (about 14 s of the portal build) stays: it may be
  the only type check the platform's FANDB-UI job runs. The shared packages' compile before
  it is about 5 s and stays for the reason given in the Dockerfile.
- **Production-only dependencies:** see iteration 4.
