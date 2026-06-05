# 94. API Client and SDK Versioning

## Status

Locked for architecture baseline.

## Research Anchors

- Semantic Versioning 2.0.0: https://semver.org/
- OpenAPI Specification: https://spec.openapis.org/oas/latest.html

## Decision

Generate clients from OpenAPI/Protobuf contracts and version them separately from backend deploys.

Artifacts:

- Flutter REST client from OpenAPI.
- TypeScript client for internal/admin tools.
- Protobuf/gRPC clients for backend services.
- Async event schema packages for workers.

## Versioning Rules

Use SemVer for published client packages.

| Change | API effect | Client version |
|---|---|---|
| Add optional response field | backward compatible | minor |
| Add optional request field | backward compatible | minor |
| Add endpoint | backward compatible | minor |
| Fix generated code bug | no API contract change | patch |
| Remove/rename field | breaking | major |
| Change field meaning/type | breaking | major |
| Tighten validation on existing field | usually breaking | major unless proven safe |

Backend app releases can use build versions, but contracts and SDKs need semantic versions because other code depends on them.

## Compatibility Matrix

Maintain a matrix:

| Client | Supported API versions | Status |
|---|---|---|
| Flutter app current | current and previous public minor | supported |
| Flutter app previous | previous public minor | grace period |
| Generated TS client | current | internal supported |

Mobile clients update slowly. Backend must tolerate at least one previous mobile contract version.

## Release Gates

Before release:

- generate OpenAPI diff;
- run contract tests;
- regenerate clients;
- run Flutter compile/tests against generated client;
- publish changelog with breaking changes highlighted.

## Best-Fact Choice

Generated clients reduce drift, but they do not remove versioning responsibility. The API contract is the product boundary; treat it as a published artifact from the start.

