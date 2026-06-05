# 267 - Kubernetes GitOps Manifest Strategy

## Decision

Use GitOps for Kubernetes delivery, with declarative manifests as the source of truth for deployed state.

Argo CD is the default pull-based reconciler candidate. Helm and Kustomize are both allowed with clear ownership boundaries.

## Sources

- Argo CD documentation: https://argo-cd.readthedocs.io/
- Argo CD sync waves: https://argo-cd.readthedocs.io/en/release-3.0/user-guide/sync-waves/
- Helm chart best practices: https://helm.sh/docs/chart_best_practices/
- Helm values best practices: https://helm.sh/docs/chart_best_practices/values/
- Kubernetes Kustomize: https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization

## Repository Layout

Recommended:

```text
deploy/
  charts/
    social-monitor-service/
  environments/
    dev/
    staging/
    prod/
  platform/
    ingress/
    observability/
    policy/
    secrets/
```

Application repo may own service chart/templates.

Environment repo or protected deployment directory owns environment values and promotion.

## Helm Boundary

Use Helm for reusable service packaging:

- Deployment
- Service
- ConfigMap
- HPA/KEDA ScaledObject
- ServiceAccount
- PodDisruptionBudget
- NetworkPolicy
- probes/resources defaults

Charts expose values, not arbitrary template escape hatches.

## Kustomize Boundary

Use Kustomize for environment overlays:

- image tag/digest pinning
- replica counts
- resource requests/limits
- environment-specific hostnames
- environment-specific policy patches
- optional components

Do not duplicate entire manifests per environment.

## Argo CD Boundary

Argo CD owns reconciliation:

- sync status
- health status
- drift detection
- sync waves/hooks where ordering matters
- rollback/promotion visibility

Manual `kubectl apply` to production is break-glass only.

## Sync Order

Use sync waves for dependencies:

```text
namespaces/RBAC
CRDs/controllers
secrets/config
databases/operators
services
jobs/migrations
ingress/routes
```

Do not depend on incidental manifest order.

## Promotion

Promotion flow:

```text
dev image digest -> staging manifest PR -> staging verification -> prod manifest PR -> prod sync
```

Production deploys by digest, not mutable tag.

## Architecture Rule

Git records intended runtime state.

The cluster reconciles from Git, and drift is visible.
