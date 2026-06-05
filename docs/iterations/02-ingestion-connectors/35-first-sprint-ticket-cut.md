# Iteration 02 - First Sprint Ticket Cut

## Sprint Objective
Deliver the first certified ingestion path with HN/RSS adapters, stable cursors, scheduler behavior and normalized feed persistence.

## Ticket 1 - SourceProviderPort
- Define provider capabilities, fetch request, cursor, result and error contracts.
- Acceptance: adapters can be implemented without changing ingestion use cases.
- Edge cases: unstable IDs, pagination gaps and provider throttling must be represented.

## Ticket 2 - Connector Certification Tests
- Build reusable tests for duplicates, retries, cursor behavior, malformed data and provider outage.
- Acceptance: fake provider, HN and RSS adapters run through the same suite.
- Edge cases: certification must fail when cursor advances before durable persistence.

## Ticket 3 - Fake Provider Adapter
- Add deterministic provider for tests and local demos.
- Acceptance: scan pipeline can be tested without external network dependency.
- Edge cases: fake provider must simulate errors and duplicates.

## Ticket 4 - HN Adapter
- Implement Hacker News ingestion through official/public endpoints.
- Acceptance: items normalize into canonical feed records with provenance.
- Edge cases: deleted/dead items, missing fields and comment/story differences.

## Ticket 5 - RSS Adapter
- Implement generic RSS/Atom adapter.
- Acceptance: feeds normalize with source identity, timestamps and stable external IDs.
- Edge cases: malformed XML, missing GUIDs, timezone ambiguity and reordered feeds.

## No-Go Criteria
- Raw provider payload leaks into feed domain.
- Cursor semantics are unclear.
- Worker idempotency is untested.
