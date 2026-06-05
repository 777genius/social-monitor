# TLS, Certificates & Workload Identity

Date: 2026-05-31
Status: baseline TLS/workload identity memory

## Decision

Use automated certificate lifecycle management for Kubernetes ingress/service TLS. Consider SPIFFE/SPIRE or service mesh mTLS later when workload-to-workload identity requirements justify the added platform complexity.

References:

- cert-manager: https://cert-manager.io/docs/
- SPIFFE/SPIRE concepts: https://spiffe.io/docs/latest/spire-about/spire-concepts/
- SPIFFE/SPIRE use cases: https://spiffe.io/docs/latest/spire-about/use-cases/
- Istio security/mTLS: https://istio.io/latest/docs/concepts/security/

## MVP

Use:

- TLS at ingress/gateway;
- cert-manager for certificate lifecycle;
- Kubernetes Secrets as certificate delivery mechanism;
- clear ownership for certificates/domains.

## Internal mTLS

Do not add service mesh/mTLS by default in MVP unless platform/security needs justify it.

Add workload identity/mTLS later when:

- multiple services handle sensitive data;
- connector runtime needs strong identity boundaries;
- zero-trust service-to-service policy becomes required;
- compliance/enterprise customers require it.

## Certificate Operations

Track:

```text
domain
certificate_owner
issuer
expiration
renewal_status
last_rotated_at
environment
```

Alerts:

- certificate expiry approaching;
- failed renewal;
- issuer failure;
- invalid certificate chain.

## Locked Decisions

1. Certificate lifecycle is automated.
2. cert-manager is preferred for Kubernetes certificate management.
3. Service mesh/mTLS is later, not MVP default.
4. Certificate ownership and expiry alerts are required.
5. Workload identity is considered when service-to-service trust becomes material.

