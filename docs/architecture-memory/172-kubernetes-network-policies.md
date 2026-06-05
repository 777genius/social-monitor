# 172. Kubernetes Network Policies

## Status

Locked for runtime security baseline.

## Research Anchors

- Kubernetes NetworkPolicy concept: https://kubernetes.io/docs/concepts/services-networking/network-policies/
- Kubernetes NetworkPolicy API: https://kubernetes.io/docs/reference/kubernetes-api/networking/network-policy-v1/

## Decision

Use default-deny network posture by namespace/environment when the CNI supports NetworkPolicy. Allow only required service-to-service and egress paths.

## Policy Model

Baseline namespaces:

- `app`;
- `data`;
- `observability`;
- `ingress`;
- `security`;
- `tools`.

Rules:

- API gateway accepts traffic only from ingress.
- Realtime gateway accepts traffic only from ingress.
- Workers do not accept public ingress.
- App services access only required brokers/databases/storage endpoints.
- Source adapters have controlled egress paths.
- Webhook delivery egress is isolated and rate-limited.
- Observability agents can collect telemetry but cannot call business APIs broadly.

## Egress Classes

| Egress | Examples |
|---|---|
| internal data | Postgres, Redis, Kafka, RabbitMQ |
| object storage | S3-compatible endpoint |
| source APIs | Reddit/HN/RSS/provider endpoints |
| AI providers | LLM/embedding providers |
| notification providers | email/push/webhook delivery |

## Best-Fact Choice

NetworkPolicy does not replace application authorization, but it limits blast radius when one workload is compromised or misconfigured.

