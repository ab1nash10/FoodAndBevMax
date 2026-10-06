# Redis on AWS (ElastiCache)

The backends keep OTPs, refresh tokens and rate limits in Redis when `REDIS_URL` is set, and in
each process's memory when it is not. Without it a deploy signs everyone out and every backend
must stay at one replica. `elasticache-redis.yaml` creates what `REDIS_URL` points at:

- an ElastiCache **Valkey 8** replication group (Redis-compatible; `Engine=redis` also works),
  cluster mode disabled, TLS in transit, encryption at rest;
- a password (AUTH token) generated into **Secrets Manager**, never written anywhere else;
- a security group that admits port 6379 from the EKS cluster's security group only;
- a subnet group over the subnets you pass.

One `cache.t4g.micro` node is enough to start (sessions, codes and counters are tiny);
`NodeCount=2` adds a replica in a second zone with automatic failover.

Everything below needs AWS CLI v2 with rights for CloudFormation, ElastiCache, EC2 security
groups, Secrets Manager and EKS `describe-cluster`, plus `kubectl` for the cluster.

## 1. Find the cluster's network

```bash
REGION=ap-south-1
CLUSTER=<eks-cluster-name>

aws eks describe-cluster --region "$REGION" --name "$CLUSTER" \
  --query 'cluster.resourcesVpcConfig.{vpc:vpcId,subnets:subnetIds,clusterSecurityGroup:clusterSecurityGroupId}'
```

Use the cluster security group as `ClientSecurityGroupId` (managed node groups carry it). If
the backend pods use their own security groups, pass that group instead.

## 2. Create the cache

```bash
aws cloudformation deploy --region "$REGION" --stack-name fandb-redis \
  --template-file infra/aws/elasticache-redis.yaml \
  --parameter-overrides \
    VpcId=vpc-xxxxxxxx \
    SubnetIds=subnet-aaaaaaaa,subnet-bbbbbbbb \
    ClientSecurityGroupId=sg-xxxxxxxx
```

Creation takes about ten to fifteen minutes.

## 3. Build REDIS_URL

```bash
output() {
  aws cloudformation describe-stacks --region "$REGION" --stack-name fandb-redis \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
TOKEN=$(aws secretsmanager get-secret-value --region "$REGION" \
  --secret-id "$(output AuthTokenSecretArn)" --query SecretString --output text)
REDIS_URL="rediss://:${TOKEN}@$(output PrimaryEndpoint):6379"
```

`rediss://` (two s) is TLS; the token goes where a password would. The value is a secret: keep
it in a credential store, never in the repository, a ticket or a chat.

## 4. Give it to the deployment

Whichever deploys the backends, they need `REDIS_URL` in their environment. Nothing else
changes: no image rebuild, no code change.

**The platform deployment** (Jenkins `Max-AI/FANDB-API`, the single `SERVICE=all` image, its
`fandb-api` chart in namespace `dev`):

```bash
kubectl -n dev create secret generic fandb-redis --from-literal=REDIS_URL="$REDIS_URL"
```

then add to the backend container in that chart, and redeploy:

```yaml
env:
  - name: REDIS_URL
    valueFrom:
      secretKeyRef:
        name: fandb-redis
        key: REDIS_URL
```

`all-services.mjs` passes it on to all three services.

**This repository's Helm chart** (`Jenkinsfile`): create a Jenkins _Secret text_ credential
`aahar-redis-url` holding `$REDIS_URL`, then add this line to the `withCredentials([...])` list in
the Deploy stage. The `helm upgrade` there already passes `REDIS_URL` into the chart's Secret.

```groovy
string(credentialsId: 'aahar-redis-url', variable: 'REDIS_URL'),
```

Create the credential first: a build that binds a missing credential fails.

## 5. Check it

```bash
curl -s https://<load-balancer>/fandb/api/v1/health
```

`checks.redis.status` should be `ok`. Sign in, redeploy, and the session should still work
afterwards. Then the backends can run more than one replica.

If `checks.redis` says _Redis is not connected_, the security group or subnets do not let the pods
reach the cache. A `redis_unavailable` log line with `WRONGPASS` means the token in
`REDIS_URL` does not match the secret. A plain `redis://` URL against this cache never connects,
because it only accepts TLS.

## Rolling back

Remove `REDIS_URL` from the deployment and redeploy: the services go back to in-memory state
(single replica again). To delete the cache:

```bash
aws cloudformation delete-stack --region "$REGION" --stack-name fandb-redis
```

The secret is deleted with the stack after Secrets Manager's recovery window.
