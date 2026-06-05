# 270 - Kubernetes Admission Runtime Policy

## Decision

Use Kubernetes admission policies to enforce runtime guardrails progressively.

Kyverno is the default candidate because it supports validation, mutation and image verification policies using Kubernetes-native resources.

## Sources

- Kyverno documentation: https://kyverno.io/docs/
- Kyverno validate rules: https://kyverno.io/docs/policy-types/cluster-policy/validate/
- Kyverno verify images: https://kyverno.io/docs/policy-types/cluster-policy/verify-images/overview/
- Kyverno ImageValidatingPolicy: https://kyverno.io/docs/policy-types/image-validating-policy/
- Kubernetes Pod Security Standards: https://kubernetes.io/docs/concepts/security/pod-security-standards/

## Policy Phases

Roll out policies in phases:

1. Audit mode in dev/staging.
2. Enforce low-risk policies.
3. Enforce signed image/digest policies.
4. Enforce production namespace policies.

Never introduce broad production enforcement without audit data.

## Baseline Policies

Required:

- allowed registries
- image digest required in production
- no privileged containers
- no hostPath unless approved
- no hostNetwork unless approved
- run as non-root where possible
- resource requests/limits required
- labels/annotations required
- probes required for services

## Image Verification

Production should verify:

- Cosign/Sigstore signature
- approved CI identity
- digest pin
- SBOM/provenance attestation when mature

Kyverno can verify images and mutate tags to digests where configured.

## Exceptions

Every exception needs:

- owner
- namespace/workload
- reason
- expiry
- risk acceptance
- review date

Permanent blanket exceptions are forbidden.

## Runtime Isolation

Use:

- namespace boundaries
- service accounts per workload class
- NetworkPolicies
- Pod Security admission/baseline/restricted profiles
- least privilege RBAC

Workers handling provider credentials or AI payloads should have tighter egress and secret access.

## Reporting

Policy reports are monitored:

- audit violations
- blocked admissions
- exception usage
- unsigned image attempts
- missing resources/probes

## Architecture Rule

Runtime policy should make insecure deployment hard.

Start in audit, mature toward enforcement.
