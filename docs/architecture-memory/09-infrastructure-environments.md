# Infrastructure & Environments

Date: 2026-05-31
Status: baseline infrastructure memory

## Decision

Use infrastructure as code from the first deployable environment.

Best default:

```text
OpenTofu for cloud/infrastructure resources
Helm/Kustomize for Kubernetes app deployment
GitHub Actions or equivalent CI for validation
```

OpenTofu is the community-driven Terraform fork under Linux Foundation stewardship. It preserves a Terraform-like workflow while avoiding new BUSL-related lock-in risk.

Reference:

- OpenTofu: https://opentofu.org/

## Environment Model

Use separate environments:

```text
local
dev
staging
production
```

Environment principles:

- `local` runs without paid provider accounts.
- `dev` uses fake/sandbox connectors by default.
- `staging` has production-like infrastructure and realistic queues/events.
- `production` has backups, audit, cost limits, secrets, policy-as-code and incident runbooks.

## Local Stack

Local development should reproduce contracts, not full production complexity.

Use Docker Compose for:

```text
Postgres
Redis
Kafka or Redpanda-compatible local broker
RabbitMQ
MinIO
Schema Registry when event schemas are active
OpenTelemetry Collector
```

Required fake adapters:

```text
FakeHnConnector
FakeRssConnector
FakeRedditConnector
FakeXConnector
FakeSummaryModel
FakeDeliveryProvider
```

Rule:

```text
A new developer must be able to run the product without real Reddit/X/OpenAI credentials.
```

## Kubernetes Gateway

Prefer Kubernetes Gateway API-compatible ingress/gateway for production.

Gateway API is role-oriented and designed to model infrastructure provider, cluster operator and application developer responsibilities more explicitly than older Ingress-only setups.

Reference:

- Kubernetes Gateway API: https://kubernetes.io/docs/concepts/services-networking/gateway/

## Secrets Delivery

Use external secret management rather than treating Kubernetes Secrets as the source of truth.

Production path:

```text
Vault/OpenBao/cloud secret manager
-> External Secrets Operator or CSI
-> Kubernetes Secret as delivery mechanism
-> pod
```

OpenBao is a Linux Foundation/OpenSSF community-driven fork of Vault. It is a valid open-source option to evaluate if Vault licensing/operations are a concern.

References:

- External Secrets Operator: https://external-secrets.io/latest/
- OpenBao: https://openbao.org/
- Kubernetes encryption at rest: https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/

## Locked Decisions

1. Use IaC from the first real environment.
2. OpenTofu is the preferred IaC default unless the deployment platform mandates another tool.
3. Local dev must not require paid provider credentials.
4. Kubernetes Gateway API is preferred for production ingress/gateway design.
5. Kubernetes Secrets are delivery mechanism, not canonical secret store.
6. Fake adapters are required engineering infrastructure.

