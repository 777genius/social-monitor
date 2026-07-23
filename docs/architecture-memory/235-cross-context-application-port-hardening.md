# Cross-Context Application Port Hardening

## Status

Implemented on `feat/production-parity-hardening`.

## Problem

The cross-context inventory found two high-risk synchronous edges:

1. `subscriptions` imported three private `monitoring` use cases plus its
   cadence policy directly from a feature use case;
2. Identity request authorization and API-key controllers imported concrete
   Usage rate-limit and audit use cases.

The same inventory found that subscription domain and command types reused
Summary and Delivery domain types. That made changes in three contexts travel
through one domain model even though the wire values are simple stable enums.

## Decision

- Consumer feature and interface code owns the port it needs.
- Cross-context translation stays in a narrow adapter.
- Nest module composition may import concrete providers to wire the port, but
  controllers, authorizers, domain and feature use cases may not.
- Subscription preference and delivery vocabulary is owned by the
  subscription context. Summary and Delivery consume structurally compatible
  values at their integration boundary.

The resulting integration paths are:

```text
ActivateInterestSourceUseCase
  -> InterestSourceProvisionerPort
  -> MonitoringInterestSourceProvisionerAdapter
  -> monitoring use cases

ApiKeyRequestAuthorizer / ApiKeysController
  -> PublicApiRateLimiterPort / PublicApiAuditWriterPort
  -> Usage adapters
  -> usage use cases
```

## Guardrails

`check:architecture` now rejects:

- any business-context import from subscription domain;
- private cross-context domain, feature, adapter or interface imports from
  subscription features;
- monitoring feature imports outside the single subscription adapter and its
  Nest composition root;
- Usage imports from Identity interfaces outside the Nest composition root.

## Evidence

- project TypeScript compiler passes;
- focused Identity and Subscription Jest suites pass;
- OpenAPI snapshot and the full AppModule reader tenant e2e bootstrap pass;
- architecture and source line-cap gates pass.
