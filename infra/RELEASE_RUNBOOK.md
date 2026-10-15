# AAHAR release runbook

How the in-repo pipeline (`Jenkinsfile` → ECR → Helm chart `infra/helm/fandb` on EKS) deploys,
and how to undo a release. The `D:\Project\devops` charts, deployed by the platform Jenkins
jobs, are a second path; see "Devops charts" at the end.

## Environments

| DEPLOY_ENV    | Namespace | Values                             | Jenkins credentials                                  | Gate            |
| ------------- | --------- | ---------------------------------- | ---------------------------------------------------- | --------------- |
| dev (default) | `dev`     | `values.yaml`                      | `aahar-database-url`, `aahar-jwt-access-secret`, ... | none            |
| uat           | `uat`     | `values.yaml` + `values-uat.yaml`  | the same IDs with `-uat`                             | none            |
| prod          | `prod`    | `values.yaml` + `values-prod.yaml` | the same IDs with `-prod`                            | manual approval |

Before the first uat or prod deploy:

1. Fill in every `REQUIRED` value in `values-uat.yaml` / `values-prod.yaml`: the site's own
   domain (`ingress.host`), its ACM certificate (`ingress.certificateArn`) and its https origin
   (`config.env.corsOrigins`). The chart refuses to render without them (`templates/guards.yaml`).
2. Create the credentials with the environment suffix: `aahar-database-url-prod`,
   `aahar-jwt-access-secret-prod`, `aahar-jwt-refresh-secret-prod` (32+ characters, different from
   each other and from every other environment), `aahar-admin-prod`, `aahar-sms-username-prod`,
   `aahar-sms-password-prod`. Each environment has its own database and signing keys.
3. Point DNS for the domain at the load balancer.
4. On the RDS instance, turn on automated backups (7+ days) and point-in-time recovery. They are
   AWS settings, not something the repository can switch on.
5. Set the job's `RDS_INSTANCE_ID_PROD` (and `_UAT` / `_DEV` if wanted) to the RDS instance
   identifier, and give the `aws-ecr` credential `rds:CreateDBSnapshot` and
   `rds:DescribeDBSnapshots`. Production refuses to deploy without it.

## What a deploy does

1. Quality gates (typecheck, lint, test), then all five images tagged with the commit (12 chars).
2. prod only: waits for a person to approve.
3. Snapshot: `fandb-<env>-pre-<tag>-<time>` of the environment's RDS instance, waiting until it is
   available (skipped for an environment with no `RDS_INSTANCE_ID_<ENV>`, except prod).
4. `helm upgrade --install --wait`: the migration hook, then the seed hook, then a rolling update.
   The seed only syncs permissions and roles and creates missing starter records; it never changes
   or revives an existing record.

## Undoing a release

Code only (no migration in the release):

```sh
helm history fandb -n <env>
helm rollback fandb <previous revision> -n <env> --wait
```

The previous revision's image tag is immutable, so this restores exactly what ran before.

Code and schema (the release ran a migration that has to be undone): migrations are
forward-only, so the way back is the snapshot taken just before it.

1. Stop writes: `kubectl scale deploy -n <env> --replicas=0 --all` (the portal and services).
2. Restore the snapshot to a new instance:
   `aws rds restore-db-instance-from-db-snapshot --db-instance-identifier <env>-restored-<date> --db-snapshot-identifier fandb-<env>-pre-<tag>-<time> ...`
   (same subnet group, security groups and parameter group as the original).
3. Update the `aahar-database-url-<env>` credential (or `aahar-database-url` for dev) to the
   restored instance's endpoint.
4. Re-run the job for the previous commit (or `helm rollback` and then `kubectl rollout restart`
   so the pods read the new URL).
5. Keep the original instance until the restored one is confirmed, then delete it.

Data written between the snapshot and step 1 is lost; check the audit log for what to re-enter.

## Rotating a secret

1. Create the new value (for the database password, change it in RDS first).
2. Update the Jenkins credential for that environment.
3. Re-run the job (or `helm upgrade` with the new value): the Secret is rewritten and the rolling
   update restarts the pods. Changing a JWT secret signs every user out once.

## Devops charts

`D:\Project\devops\dev\fandb` (releases `fandb` and `fandb-api`) is deployed by the platform
Jenkins jobs, not by this Jenkinsfile. Its `aahar-secrets` Secret no longer keeps values in git:
each key comes from `--set-string secrets.<KEY>=...` at deploy time or is kept from the Secret
already in the cluster (see the comment in its `templates/secrets.yaml`). The values that used to
be committed there are still in that repository's history and must be rotated. Its migrations run
when the pod starts (`backend/all-services.mjs`), so take a manual RDS snapshot before deploying
a release that contains a migration.
