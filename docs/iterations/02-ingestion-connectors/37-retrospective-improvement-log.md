# Iteration 02 - Retrospective Improvement Log

## Retrospective Goal
Capture whether ingestion is reliable, provider-neutral and safe enough for summarization to depend on it.

## What Worked
- Connector certification tests made adapter behavior comparable.
- HN/RSS first kept production source risk low.
- Cursor and idempotency rules reduced duplicate feed risk.

## What To Improve
- Improve provider error taxonomy if failures are too generic.
- Add more malformed RSS and reordered feed fixtures.
- Clarify capability profile fields that adapters interpret inconsistently.

## Architecture Lessons
- Ingestion use cases should not know provider-specific payloads.
- Cursor writes are part of transactional reliability, not adapter convenience.
- Source limits and failures must become product-visible states.

## Edge Cases Found
- Provider returns duplicate or reordered items.
- RSS feed has no stable GUID.
- External item disappears between scans.
- Worker retries after partial persistence.

## Carryover To Next Iteration
- Summarization must consume normalized feed only.
- Provenance must be complete enough for citations.
- Any unresolved source reliability risk must be visible in summary confidence.
