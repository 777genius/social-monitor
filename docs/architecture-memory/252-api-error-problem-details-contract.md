# 252 - API Error Problem Details Contract

## Decision

REST APIs return errors using RFC 9457 Problem Details shape with product-specific extensions.

Every public error must be machine-readable, support localization in the client and avoid leaking implementation details.

## Sources

- RFC 9457 Problem Details for HTTP APIs: https://www.rfc-editor.org/rfc/rfc9457.html
- OpenAPI Specification: https://spec.openapis.org/oas/
- OWASP API Security Top 10: https://owasp.org/API-Security/
- OWASP Error Handling guidance: https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html

## Error Shape

Base fields:

```json
{
  "type": "https://api.social-monitor.example/problems/validation-failed",
  "title": "Validation failed",
  "status": 400,
  "detail": "One or more fields are invalid.",
  "instance": "/v1/topics",
  "code": "validation_failed",
  "trace_id": "..."
}
```

Extensions:

- `code`
- `trace_id`
- `field_errors`
- `retry_after`
- `required_capability`
- `quota_scope`
- `source_status`

## Error Taxonomy

Required stable codes:

- `validation_failed`
- `unauthenticated`
- `forbidden`
- `not_found`
- `conflict`
- `rate_limited`
- `quota_exceeded`
- `source_auth_expired`
- `source_capability_unavailable`
- `provider_rate_limited`
- `summary_budget_exceeded`
- `idempotency_conflict`
- `request_too_large`
- `internal_error`

Codes are stable API contract. Messages may change.

## HTTP Status Policy

Use:

- `400` invalid request shape/semantics
- `401` missing/invalid auth
- `403` authenticated but not allowed
- `404` not found or hidden object
- `409` state conflict/idempotency conflict
- `413` payload too large
- `422` well-shaped but semantically unprocessable when helpful
- `429` rate/quota limited
- `500` unexpected server error
- `502/503/504` upstream/provider/availability failures where appropriate

## Security

Never expose:

- stack traces
- SQL errors
- raw provider responses with secrets
- internal hostnames
- raw tokens
- exact authorization policy internals

Detailed diagnostics go to logs/traces, correlated by `trace_id`.

## Flutter Mapping

Generated client maps Problem Details to typed application errors:

```text
ProblemDetailsDto -> ApiFailure -> UseCaseFailure -> Store state
```

Presentation stores decide:

- inline field error
- toast/banner
- full-screen error
- retry button
- source attention state

## Localization

Client UI should localize by `code`, not by server `detail`.

Server `detail` is useful for API consumers and logs, but should not be the sole user-facing text strategy.

## Testing

Required:

- all controllers use common error filter
- OpenAPI declares error schema
- sensitive data redaction test
- auth errors distinguish 401/403 consistently
- validation field errors stable
- Flutter generated client handles unknown codes

## Architecture Rule

Errors are part of the product API.

They must be versioned, tested and observable like successful responses.
