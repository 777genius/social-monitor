# Iteration 02 - Definition Of Ready For Tickets

## Ready Goal
Ensure ingestion tickets can be built through ports/adapters and certified before downstream consumers depend on them.

## Required Ticket Context
- Source provider or ingestion use case.
- Capability profile impact.
- Cursor behavior.
- Normalized feed impact.
- Source policy approval state.

## Required Acceptance Checks
- Adapter passes connector certification.
- Provider errors map to taxonomy.
- Cursor advances only after durable persistence.
- Feed items include stable ID and provenance.
- Retry/dead-letter behavior is stated.

## Required Edge Cases
- Duplicate provider item.
- Reordered pages/feed entries.
- Missing external ID.
- Provider timeout or malformed response.

## Not Ready If
- Adapter requires downstream provider-specific fields.
- Source acquisition path is not policy-approved.
- Cursor behavior under crash/retry is unclear.

## Ready Output
Ticket can add or change ingestion behavior without changing summarization or mobile contracts.
