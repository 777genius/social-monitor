# Iteration 02 - Risk-Based Priority

## Priority 1 - Connector SDK And Certification

- Risk: Each source behaves differently and cannot be swapped.
- Do First: Define provider port, capabilities and certification tests.
- Do Not Defer: Shared connector contract.

## Priority 2 - Cursor And Idempotency Discipline

- Risk: Scans lose or duplicate data.
- Do First: Save cursor after durable writes and test replay.
- Do Not Defer: Worker crash scenario.

## Priority 3 - Dedupe And Provenance

- Risk: Feed noise damages summaries and user trust.
- Do First: Dedupe by provider ID, canonical URL and content hash.
- Do Not Defer: Source provenance fields.

## Priority 4 - Provider Failure Classification

- Risk: Failures are invisible or unactionable.
- Do First: Error taxonomy and dead-letter context.
