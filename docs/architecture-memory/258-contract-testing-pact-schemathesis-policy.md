# 258 - Contract Testing Pact/Schemathesis Policy

## Decision

Use two complementary contract-testing styles:

- Pact-style consumer/provider tests for important client/provider expectations.
- OpenAPI-driven property/fuzz tests for REST schema conformance and robustness.

## Sources

- Pact documentation: https://docs.pact.io/
- Pact how it works: https://docs.pact.io/getting_started/how_pact_works
- Pact JavaScript consumer tests: https://docs.pact.io/implementation_guides/javascript/docs/consumer
- Schemathesis documentation: https://schemathesis.readthedocs.io/
- OpenAPI Specification: https://spec.openapis.org/oas/

## Pact Use Cases

Use Pact for:

- Flutter mobile client assumptions about REST API
- public SDK expectations
- internal service HTTP/gRPC message contracts where supported
- webhook consumer/provider expectations
- event/message contracts when consumer behavior matters

Pact is most useful where consumer expectations drive provider compatibility.

## OpenAPI Property Testing

Use OpenAPI-based testing for:

- unexpected request shapes
- validation gaps
- undocumented status codes
- response schema mismatches
- server errors on generated edge cases
- auth boundary smoke tests

Schemathesis or equivalent tooling can generate tests from the OpenAPI schema.

## Contract Ownership

Contracts are owned by both sides:

- consumer writes expectations it actually uses
- provider verifies them before release
- API owner maintains OpenAPI source
- breaking changes require review and migration path

## CI Gates

Required:

- OpenAPI lint
- generated client freshness
- provider verifies Pact contracts
- Flutter client contract tests for critical flows
- property-based OpenAPI smoke test for major endpoints

Critical flows:

- login/session status
- topic CRUD
- source binding status
- scan policy update
- feed list
- summary detail
- Problem Details errors

## What Contract Tests Do Not Replace

They do not replace:

- domain unit tests
- security authorization tests
- performance tests
- provider sandbox tests
- E2E smoke tests

## Versioning

Contract artifacts must include:

- API version
- consumer version
- provider version
- environment
- git SHA/build id

## Architecture Rule

Contract tests protect boundaries.

They are not a substitute for good boundary design, but they stop accidental drift.
