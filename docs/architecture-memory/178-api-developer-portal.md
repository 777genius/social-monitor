# 178. API Developer Portal

## Status

Locked for API/product baseline.

## Research Anchors

- OpenAPI Specification: https://spec.openapis.org/oas/latest.html
- Swagger OpenAPI tooling overview: https://swagger.io/docs/specification/v3_0/about/
- Redocly API reference docs: https://redocly.com/docs/api-reference-docs/getting-started/

## Decision

When public/external API access is offered, provide a developer portal generated from OpenAPI plus curated examples and operational guidance.

## Portal Contents

Required:

- authentication guide;
- idempotency guide;
- pagination guide;
- rate-limit behavior;
- webhook signatures;
- error catalog;
- changelog/deprecations;
- SDK links;
- source policy notes where relevant;
- sandbox/demo environment instructions.

## Documentation Rules

- OpenAPI is source of endpoint truth.
- Human-authored guides explain workflows and edge cases.
- Examples are tested in CI where practical.
- Error examples use RFC 9457-style shape.
- Do not expose internal service structure as API organization.

## Best-Fact Choice

Generated API reference is necessary but insufficient. A useful developer portal needs workflow guides, examples, limits and failure behavior.

