# 141. Infrastructure as Code and GitOps

## Status

Locked for infrastructure baseline.

## Research Anchors

- OpenTofu remote state: https://opentofu.org/docs/language/state/remote/
- OpenTofu backend configuration: https://opentofu.org/docs/language/settings/backends/configuration/
- Kubernetes Kustomize: https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/
- Helm chart best practices: https://helm.sh/docs/chart_best_practices/

## Decision

Use infrastructure as code for cloud resources and declarative Kubernetes config for runtime. Keep cloud infrastructure state separate from application deployment state.

## Layers

| Layer | Tooling | Owns |
|---|---|---|
| cloud foundation | OpenTofu/Terraform-compatible IaC | network, clusters, databases, storage, DNS |
| Kubernetes platform | Helm/Kustomize | operators, ingress, cert-manager, observability |
| application deploy | GitOps or CI deploy | app manifests, config refs, image tags |
| secrets | external secret manager + ESO | secret material delivery |

## State Rules

- Use remote state with locking for shared environments.
- Separate states by environment and major ownership boundary.
- Do not use one huge state for everything.
- Treat state files as sensitive.
- Plans for production require review before apply.

## Kubernetes Packaging

Use Helm for third-party charts and reusable packaged components. Use Kustomize or generated manifests for environment overlays where YAML patches are simpler than templating.

## Best-Fact Choice

IaC manages infrastructure; GitOps manages desired runtime state. Mixing every concern into one tool makes promotion, rollback and ownership harder.

