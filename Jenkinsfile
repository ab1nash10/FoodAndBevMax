// AAHAR CI/CD.
//
// One Helm release, `fandb`, in namespace `dev`, covering all three backend services and
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
//
// Configure under "Global properties" or here:
//   AWS_ACCOUNT_ID, AWS_REGION, EKS_CLUSTER_NAME, K8S_NAMESPACE, HELM_RELEASE.
//
// The portal takes no per-environment API URLs. It calls the APIs on its own origin under
// the routing prefix, which the ingress already routes to the services, so one image is
// correct on any hostname.

pipeline {
  agent any

  environment {
    AWS_ACCOUNT_ID   = '013929206983'
    AWS_REGION       = 'ap-south-1'
    EKS_CLUSTER_NAME = 'aahar'
    K8S_NAMESPACE    = 'dev'
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

    stage('Deploy') {
      steps {
        withCredentials([
          aws(credentialsId: 'aws-ecr'),
          string(credentialsId: 'aahar-database-url', variable: 'DATABASE_URL'),
          string(credentialsId: 'aahar-jwt-access-secret', variable: 'JWT_ACCESS_SECRET'),
          string(credentialsId: 'aahar-jwt-refresh-secret', variable: 'JWT_REFRESH_SECRET'),
          usernamePassword(credentialsId: 'aahar-admin',
                           usernameVariable: 'ADMIN_EMAIL', passwordVariable: 'ADMIN_PASSWORD'),
          // Bulk SMS gateway login for mobile OTPs. Both must exist in Jenkins before this runs.
          string(credentialsId: 'aahar-sms-username', variable: 'SMS_USERNAME'),
          string(credentialsId: 'aahar-sms-password', variable: 'SMS_PASSWORD'),
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

            helm upgrade --install "$HELM_RELEASE" infra/helm/fandb \
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
      sh 'docker image prune -f || true'
    }
  }
}
