# X Collector gRPC Architecture

Date: 2026-06-27

## Decision

Use a separate Python `apps/x-collector` service with a protobuf/gRPC contract in
`libs/contracts/grpc/x_collector/v1/x_collector.proto`.

The TypeScript ingestion worker must not import Scweet or Python-specific
runtime concerns. It talks to `x-collector` through a generated gRPC client and
an ingestion anti-corruption port:

```text
monitoring scan -> SourceProviderPort
  -> XTwitterSourceProvider
  -> XDailyCollectorClientPort
  -> GrpcXDailyCollectorClient
  -> x-collector gRPC service
  -> ScweetDailySearchCollector
  -> Scweet
```

## Why gRPC Now

- The collector is a separate process and a different language runtime.
- The contract must be typed for TypeScript and Python.
- Deadlines, metadata and status codes are first-class transport concerns.
- Future collectors can reuse the same contract-first generation pattern.

HTTP `/internal/*` would be simpler for one service, but it would push schema
validation and status semantics into ad hoc DTOs. gRPC is worth the extra
toolchain here because the boundary is service-to-service and likely to grow.

## Boundaries

- `libs/contracts/grpc` owns `.proto` files only.
- `libs/contracts/generated/grpc` owns TypeScript generated code.
- `apps/x-collector/src/x_collector/v1` owns Python generated protobuf stubs.
- `libs/platform/grpc` owns TypeScript transport helpers.
- ingestion domain/features/ports do not import generated protobuf or `@grpc/*`.
- Scweet is only imported inside the Python Scweet adapter factory.

## Runtime Controls

- TypeScript provider key: `x-twitter`.
- `x-twitter-experimental-daily` is retained only as a deprecated alias.
- Runtime registration is opt-in via `X_COLLECTOR_ENABLED=1` and
  `X_COLLECTOR_GRPC_ADDRESS`.
- `X_COLLECTOR_EXPERIMENTAL_ENABLED=1` remains accepted as a legacy compatibility alias.
- Public source bindings use canonical `providerKey: x-twitter`.
- Scheduler cadence floor is 86,400 seconds for this provider.
- Optional bearer auth is passed through `X_COLLECTOR_SERVICE_TOKEN`.
- Raw Scweet/X payloads are not returned to TypeScript.

## Data Shape

`CollectDailySearch` is intentionally narrow:

- daily search query
- language
- time window
- Top/Latest search product
- engagement thresholds
- normalized posts with canonical URL, author, metrics, media URLs and score

This keeps the first contract stable while leaving profile timelines, accounts
and richer media as future protobuf versions.

## Risk Posture

Scweet is an unofficial X web GraphQL collector. Product code must treat it as
replaceable runtime behind `x-collector`, not as a public domain/provider model.

The current architecture contains the risk by isolating Scweet in one Python
service, requiring explicit runtime opt-in, enforcing daily cadence, and making
rollback an environment change.
