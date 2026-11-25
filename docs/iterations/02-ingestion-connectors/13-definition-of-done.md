# Iteration 02 - Definition Of Done

## Done Checklist

1. Connector SDK exists.
2. Capability profile exists.
3. Provider error taxonomy exists.
4. Certification tests exist.
5. HN adapter passes tests.
6. RSS adapter passes tests.
7. Scheduler creates due jobs.
8. Worker lease prevents duplicates.
9. Retry/backoff/dead-letter behavior exists.
10. Cursor is saved after durable writes.
11. Normalized feed items persist.
12. Dedupe works.
13. Feed API returns provenance.

## Architecture Done

- Provider payloads stay in adapters/raw metadata.
- Feed domain uses normalized items.
- Source capability and risk class are visible.
- Jobs are idempotent and tenant-scoped.

## Evidence Required

- Connector certification results.
- Repeated scan output.
- Dedupe test output.
- Dead-letter sample.
- Feed API sample.

## Not Done If

- Retry creates duplicates.
- Cursor discipline is unclear.
- Feed item lacks source provenance.
- Adapter requires unsafe production scraping.
