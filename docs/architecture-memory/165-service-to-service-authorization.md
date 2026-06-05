# 165. Service-to-Service Authorization

## Status

Locked for zero-trust baseline.

## Research Anchors

- SPIFFE/SPIRE concepts: https://spiffe.io/docs/latest/spire-about/spire-concepts/
- Kubernetes service accounts: https://kubernetes.io/docs/concepts/security/service-accounts/
- Istio authorization policy: https://istio.io/latest/docs/reference/config/security/authorization-policy/
- OPA Envoy plugin: https://www.openpolicyagent.org/docs/envoy

## Decision

Internal traffic is not automatically trusted. Services authenticate as workloads and authorize calls by service identity, action and resource scope.

## Baseline

MVP:

- Kubernetes service accounts per deployable;
- least-privilege RBAC;
- projected service account tokens;
- network policies;
- internal API auth using signed service tokens or mTLS-capable gateway.

Scale:

- service mesh mTLS;
- workload identities via SPIFFE/SPIRE or cloud-native equivalent;
- authorization policies by namespace/service/account;
- optional OPA/Envoy external authorization for complex policy.

## Rules

- No shared "internal admin" token across services.
- Worker service identity is distinct from API gateway identity.
- Service calls include request id and actor/tenant context where needed.
- Downstream service re-checks authorization for sensitive actions.
- Privileged internal operations are audited.

## Best-Fact Choice

Network location is not authorization. Workload identity plus explicit service-level policy prevents a compromised low-privilege worker from becoming a platform-wide actor.

