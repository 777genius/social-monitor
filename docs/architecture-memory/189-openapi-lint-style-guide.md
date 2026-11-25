# 189. OpenAPI Lint and Style Guide

## Status

Locked for API contract baseline.

## Research Anchors

- OpenAPI Specification: https://spec.openapis.org/oas/latest.html
- Redocly API docs: https://redocly.com/docs
- Spectral documentation: https://docs.stoplight.io/docs/spectral/

## Decision

OpenAPI contracts must pass lint/style checks before merge. API consistency is enforced by tooling, not reviewer memory.

## Style Rules

- Paths use plural resources: `/v1/interests`.
- Use stable operation ids: `TopicsController_createTopic`.
- Every operation has tags, summary, response schemas and error responses.
- All errors use shared Problem Details schema.
- Pagination parameters are reusable components.
- Idempotency header is documented for side-effect commands.
- Security schemes are explicit per operation.
- Deprecated fields/endpoints include deprecation notes.

## CI Gates

Run:

- OpenAPI schema validation;
- style/lint rules;
- breaking diff for public API;
- generated client freshness check;
- docs build check.

## Best-Fact Choice

OpenAPI is both contract and product documentation source. A weak spec creates bad clients, bad docs and avoidable support load.

