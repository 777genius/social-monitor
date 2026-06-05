# Iteration 02 - Role-Based Execution Plan

## Ingestion Engineer

- Build connector SDK.
- Implement provider registry.
- Implement HN/RSS adapters.
- Maintain certification tests.

## Worker Engineer

- Implement scheduler.
- Implement worker lease.
- Implement retry/backoff/dead-letter.
- Enforce cursor discipline.

## Feed/Data Engineer

- Implement normalized item schema.
- Implement dedupe.
- Build feed read model and API.

## QA

- Build malformed/duplicate/expired-cursor fixtures.
- Verify repeated scan idempotency.
- Verify dead-letter context.

## Product/Source Owner

- Review source capability profiles.
- Approve source risk class.
- Keep unsupported sources out of MVP scope.

## Handoffs

- Normalized feed schema -> summary/mobile.
- Provider failure taxonomy -> realtime/support.
- Source health status -> ops.
