# 135. Public API Governance

## Status

Locked for API baseline.

## Research Anchors

- OpenAPI Specification: https://spec.openapis.org/oas/latest.html
- RFC 9457 Problem Details for HTTP APIs: https://www.rfc-editor.org/rfc/rfc9457
- Semantic Versioning: https://semver.org/

## Decision

Public API must be consistent, generated, documented and versioned from the first SaaS-facing release.

## Standards

- OpenAPI 3.1 is the source for REST contracts.
- Error responses follow Problem Details style with stable product error codes.
- Idempotency is required for side-effect commands.
- Pagination uses opaque cursors by default.
- Timestamps are RFC 3339 UTC.
- IDs are opaque strings.
- Deprecations are documented with removal dates.

## Error Shape

```json
{
  "type": "https://docs.example.com/errors/plan-limit-exceeded",
  "title": "Plan limit exceeded",
  "status": 403,
  "code": "plan_limit_exceeded",
  "detail": "This tenant has reached the daily summary limit.",
  "requestId": "req_123"
}
```

Do not expose provider secrets, raw upstream errors or cross-tenant details.

## Deprecation Policy

Before removing public behavior:

- mark deprecated in OpenAPI;
- publish changelog;
- support previous mobile client window;
- add telemetry to measure usage;
- provide migration path;
- remove only after agreed window.

## Best-Fact Choice

The public API is a product contract. Consistency and deprecation discipline matter more than exposing internal service structure quickly.

