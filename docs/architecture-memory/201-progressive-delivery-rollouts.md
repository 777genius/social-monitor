# 201. Progressive Delivery and Rollouts

## Status

Locked for release baseline.

## Research Anchors

- Kubernetes rolling updates: https://kubernetes.io/docs/tutorials/kubernetes-basics/update/update-intro/
- Argo Rollouts concepts: https://argoproj.github.io/argo-rollouts/concepts/
- Argo Rollouts canary: https://argoproj.github.io/argo-rollouts/features/canary/
- Argo Rollouts blue-green: https://argoproj.github.io/argo-rollouts/features/bluegreen/

## Decision

Start with standard Kubernetes rolling updates for MVP. Introduce Argo Rollouts canary/blue-green when production traffic, SLOs and rollback risk justify progressive delivery.

## Rollout Classes

| Change | Strategy |
|---|---|
| low-risk stateless API | rolling update |
| worker code with idempotent jobs | rolling update with drained shutdown |
| API contract-visible change | staged release + client compatibility checks |
| source adapter behavior change | feature flag + canary tenants |
| AI prompt/model router change | eval gate + canary + rollback |
| high-risk database behavior | expand/contract migration + staged readers |

## Analysis Gates

Canary promotion checks:

- 5xx/error rate;
- latency SLO;
- queue lag/job failures;
- DLQ increase;
- source adapter error rate;
- summary validation failure rate;
- cost anomaly;
- tenant support signals where available.

## Best-Fact Choice

Progressive delivery is valuable only with metrics that can detect bad behavior. Without analysis gates, canary becomes ceremony.

