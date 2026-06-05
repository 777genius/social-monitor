# Iteration 02 - Sprint Review Demo Script

## Review Goal
Prove that ingestion can scan supported sources reliably, persist normalized feed items and recover from provider failures.

## Demo Flow
1. Run connector certification tests.
2. Scan fake provider with duplicates and errors.
3. Scan Hacker News source.
4. Scan RSS/Atom source.
5. Show normalized feed records, cursors and provenance.

## Evidence To Show
- SourceProviderPort is provider-neutral.
- HN/RSS adapters pass certification tests.
- Cursor advances only after durable persistence.
- Worker retries and dead-letter behavior are documented.

## Edge Cases To Exercise
- Provider returns duplicate items.
- RSS item has no GUID.
- HN item is deleted or missing fields.
- Provider outage occurs during scheduled scan.

## Review Questions
- Can summarization consume feed data without provider-specific logic?
- Are connector limits and failure modes visible to users/operators?
- Are unsupported source strategies blocked by policy?

## Accept Progress If
- Normalized feed is stable.
- Cursors are safe.
- Ingestion failures are recoverable and observable.
