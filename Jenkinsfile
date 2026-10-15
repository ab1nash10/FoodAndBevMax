// AAHAR CI/CD.
//
// One Helm release, `fandb`, per environment namespace (DEPLOY_ENV: dev, uat or prod), covering all three backend services and
// the portal. The raw manifests under infra/k8s and in backend/ and frontend/ are a
// separate, unused path - see infra/k8s/README.md. Do not apply both: their ingresses join
// the same ALB group and the controller rejects the conflict.
//
// Every commit builds all five images, not just the side that changed. The chart resolves
// every image from a single `image.tag`, so deploying a tag that exists for only one side
// leaves the other in ImagePullBackOff. Turbo and Docker layer caching keep the unchanged
// side cheap.
//
// Every docker build runs from the repository root with `-f <side>/Dockerfile ... .`. That
// is required, not stylistic: the images use `turbo prune`, which needs the whole workspace
// (pnpm-workspace.yaml, the lockfile and every package manifest) to work out what a given
// app actually depends on. Building with `frontend/` or `backend/` as the context fails.
//
// The agent needs `helm` (v3) and `kubectl` on PATH, alongside `aws` and `docker`.
//
// Jenkins credentials expected:
//   aws-ecr                    - AWS credentials with ECR push and eks:DescribeCluster
//   aahar-database-url         - secret text, the Postgres URL incl. ?connection_limit=10
//   aahar-jwt-access-secret    - secret text, 32+ characters
//   aahar-jwt-refresh-secret   - secret text, 32+ characters, different from the access one
//   aahar-admin                - username/password; the password is the Super Admin's
//                                (aahar@admin.local) first password, applied only while the
//                                account has none. It is never kept in the repository.
//   aahar-sms-username         - secret text, bulk SMS gateway login for mobile OTPs
//   aahar-sms-password         - secret text, bulk SMS gateway password
//   aahar-microsoft-client-secret - secret text, optional: the Entra ID app's client secret
//                                for "Sign in with Microsoft"; without it that option is off
//
// Environments: the DEPLOY_ENV parameter picks dev (the default, unchanged), uat or prod.
// uat and prod deploy to their own namespace with infra/helm/fandb/values-<env>.yaml (their
// domain, certificate and HTTPS redirect) and read the credentials above with a -<env> suffix
// (aahar-database-url-prod, aahar-jwt-access-secret-prod, ...), so no environment shares a
// database or signing keys. prod waits for a manual approval.
//
// Before the migration hooks run, the database is snapshotted when the job defines
// RDS_INSTANCE_ID_DEV / RDS_INSTANCE_ID_UAT / RDS_INSTANCE_ID_PROD (the RDS instance
// identifier; aws-ecr then also needs rds:CreateDBSnapshot and rds:DescribeDBSnapshots).
// prod refuses to deploy without one: its migrations are forward-only.
//
// Configure under "Global properties" or here:
//   AWS_ACCOUNT_ID, AWS_REGION, EKS_CLUSTER_NAME, K8S_NAMESPACE, HELM_RELEASE.
//
// The portal takes no per-environment API URLs. It calls the APIs on its own origin under
// the routing prefix, which the ingress already routes to the services, so one image is
// correct on any hostname.

// Credential ID suffix: '' for dev (the IDs it has always used), '-uat' or '-prod' otherwise.
// A function, not an environment value: Jenkins can turn an empty environment value into null.
def credSuffix() {
  (params.DEPLOY_ENV ?: 'dev') == 'dev' ? '' : "-${params.DEPLOY_ENV}"
}

pipeline {
  agent any

  parameters {
    choice(name: 'DEPLOY_ENV', choices: ['dev', 'uat', 'prod'],
           description: 'dev keeps today\'s behaviour; uat and prod use values-<env>.yaml and the -<env> credentials.')
  }

  environment {
    AWS_ACCOUNT_ID   = '013929206983'
    AWS_REGION       = 'ap-south-1'
    EKS_CLUSTER_NAME = 'aahar'
    // The first run of this job has no parameters yet: it deploys dev, as before.
    K8S_NAMESPACE    = "${params.DEPLOY_ENV ?: 'dev'}"
    HELM_RELEASE     = 'fandb'
    // Path-based routing: the platform is served under /fandb on the shared ALB.
    NEXT_PUBLIC_BASE_PATH = '/fandb'
    REGISTRY         = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    // Immutable tag. Never deploy `latest`: a rollback needs a tag that cannot move.
    IMAGE_TAG        = "${env.GIT_COMMIT.take(12)}"
  }

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '30'))
  }

  stages {
    stage('Quality gates') {
      steps {
        sh '''
          corepack enable
          pnpm install --frozen-lockfile
          pnpm db:generate
          pnpm typecheck
          pnpm lint
          pnpm test
        '''
      }
    }

    stage('Login to ECR') {
      steps {
        withCredentials([aws(credentialsId: 'aws-ecr')]) {
          sh 'aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"'
        }
      }
    }

    stage('Build') {
      parallel {
        stage('Frontend image') {
          steps {
            // Note the trailing "." - the context is the repository root.
            sh '''
              docker build -f frontend/Dockerfile \
                --build-arg NEXT_PUBLIC_BASE_PATH="$NEXT_PUBLIC_BASE_PATH" \
                -t "$REGISTRY/max-ai-repo:admin-portal-$IMAGE_TAG" .
              docker push "$REGISTRY/max-ai-repo:admin-portal-$IMAGE_TAG"
            '''
          }
        }

        stage('Backend images') {
          steps {
            sh '''
              for SERVICE in auth-service user-service organization-service; do
                docker build -f backend/Dockerfile \
                  --target runner --build-arg SERVICE="$SERVICE" \
                  -t "$REGISTRY/max-ai-repo:$SERVICE-$IMAGE_TAG" .
                docker push "$REGISTRY/max-ai-repo:$SERVICE-$IMAGE_TAG"
              done

              docker build -f backend/Dockerfile \
                --target migrate --build-arg SERVICE=user-service \
                -t "$REGISTRY/max-ai-repo:migrate-$IMAGE_TAG" .
              docker push "$REGISTRY/max-ai-repo:migrate-$IMAGE_TAG"
            '''
          }
        }
      }
    }

    stage('Approve production') {
      when { environment name: 'K8S_NAMESPACE', value: 'prod' }
      steps {
        input message: "Deploy ${env.IMAGE_TAG} to production?", ok: 'Deploy to production'
      }
    }

    stage('Snapshot database') {
      // The migration hooks run before the rollout and are forward-only: this snapshot is the
      // way back if a release has to be undone together with its schema change.
      steps {
        withCredentials([aws(credentialsId: 'aws-ecr')]) {
          sh '''
            set -e
            case "$K8S_NAMESPACE" in
              dev) RDS_ID="${RDS_INSTANCE_ID_DEV:-}" ;;
              uat) RDS_ID="${RDS_INSTANCE_ID_UAT:-}" ;;
              prod) RDS_ID="${RDS_INSTANCE_ID_PROD:-}" ;;
              *) RDS_ID="" ;;
            esac

            if [ -z "$RDS_ID" ]; then
              if [ "$K8S_NAMESPACE" = "prod" ]; then
                echo "RDS_INSTANCE_ID_PROD is not set: production is never migrated without a snapshot." >&2
                exit 1
              fi
              echo "No RDS instance configured for $K8S_NAMESPACE: skipping the pre-migration snapshot."
              exit 0
            fi

            SNAPSHOT="fandb-$K8S_NAMESPACE-pre-$IMAGE_TAG-$(date +%Y%m%d%H%M%S)"
            aws rds create-db-snapshot --region "$AWS_REGION" \
              --db-instance-identifier "$RDS_ID" --db-snapshot-identifier "$SNAPSHOT"
            aws rds wait db-snapshot-available --region "$AWS_REGION" \
              --db-snapshot-identifier "$SNAPSHOT"
            echo "Snapshot $SNAPSHOT is available; restore from it to undo this release's migrations."
          '''
        }
      }
    }

    stage('Deploy') {
      steps {
        script {
          // Sign in with Microsoft is optional: without this credential its button just does not
          // show, and the deploy carries on. The secret reaches helm in a private values file
          // (removed in post), never on a command line. Entra secrets use only [A-Za-z0-9~._-],
          // so a double-quoted YAML string holds them unchanged.
          try {
            withCredentials([string(credentialsId: "aahar-microsoft-client-secret${credSuffix()}",
                                    variable: 'MICROSOFT_CLIENT_SECRET')]) {
              sh '''
                umask 077
                printf 'config:\n  secrets:\n    MICROSOFT_CLIENT_SECRET: "%s"\n' "$MICROSOFT_CLIENT_SECRET" > .microsoft-secret.yaml
              '''
            }
          } catch (err) {
            echo "No aahar-microsoft-client-secret${credSuffix()} credential: Sign in with Microsoft stays off."
          }
        }
        withCredentials([
          aws(credentialsId: 'aws-ecr'),
          string(credentialsId: "aahar-database-url${credSuffix()}", variable: 'DATABASE_URL'),
          string(credentialsId: "aahar-jwt-access-secret${credSuffix()}", variable: 'JWT_ACCESS_SECRET'),
          string(credentialsId: "aahar-jwt-refresh-secret${credSuffix()}", variable: 'JWT_REFRESH_SECRET'),
          usernamePassword(credentialsId: "aahar-admin${credSuffix()}",
                           usernameVariable: 'ADMIN_EMAIL', passwordVariable: 'ADMIN_PASSWORD'),
          // Bulk SMS gateway login for mobile OTPs. Both must exist in Jenkins before this runs.
          string(credentialsId: "aahar-sms-username${credSuffix()}", variable: 'SMS_USERNAME'),
          string(credentialsId: "aahar-sms-password${credSuffix()}", variable: 'SMS_PASSWORD'),
        ]) {
          // The chart runs the migration and the seed as pre-upgrade hooks, in that order,
          // before any Deployment rolls - so there is nothing to sequence here. `--wait`
          // fails the build if a pod never becomes ready, rather than reporting success
          // over a CrashLoopBackOff.
          //
          // helm --set splits on commas, so a value containing one must escape it as `\,`.
          // Base64 secrets and a standard Postgres or Redis URL contain none.
          //
          // REDIS_URL is optional: set it on the job (an environment variable, or a credential
          // bound under that name) to point the services at ElastiCache. Empty keeps each pod's
          // in-memory store, which needs one replica per service. infra/aws/README.md creates the
          // cache and the aahar-redis-url credential to bind above.
          sh '''
            aws eks update-kubeconfig --name "$EKS_CLUSTER_NAME" --region "$AWS_REGION"

            # dev uses values.yaml alone, as before; uat and prod add their own file.
            ENV_VALUES=""
            if [ "$K8S_NAMESPACE" != "dev" ]; then
              ENV_VALUES="-f infra/helm/fandb/values-$K8S_NAMESPACE.yaml"
            fi

            MICROSOFT_VALUES=""
            if [ -f .microsoft-secret.yaml ]; then
              MICROSOFT_VALUES="-f .microsoft-secret.yaml"
            fi

            helm upgrade --install "$HELM_RELEASE" infra/helm/fandb $ENV_VALUES $MICROSOFT_VALUES \
              --namespace "$K8S_NAMESPACE" --create-namespace \
              --set-string image.tag="$IMAGE_TAG" \
              --set-string config.secrets.DATABASE_URL="$DATABASE_URL" \
              --set-string config.secrets.JWT_ACCESS_SECRET="$JWT_ACCESS_SECRET" \
              --set-string config.secrets.JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
              --set-string config.secrets.ADMIN_PASSWORD="$ADMIN_PASSWORD" \
              --set-string config.secrets.SMS_USERNAME="$SMS_USERNAME" \
              --set-string config.secrets.SMS_PASSWORD="$SMS_PASSWORD" \
              --set-string config.secrets.REDIS_URL="${REDIS_URL:-}" \
              --wait --timeout 10m
          '''
        }
      }
    }
  }

  post {
    always {
      sh 'rm -f .microsoft-secret.yaml'
      sh 'docker image prune -f || true'
    }
  }
}
