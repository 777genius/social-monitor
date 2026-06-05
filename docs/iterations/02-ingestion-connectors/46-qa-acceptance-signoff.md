# Iteration 02 - QA Acceptance Signoff

## Signoff Goal
Confirm that ingestion is certified, normalized and safe for summaries.

## Acceptance Scenarios
- Fake provider passes certification.
- HN adapter persists normalized feed items.
- RSS adapter persists normalized feed items.
- Cursor advances only after durable persistence.
- Provider failures are visible and classified.

## Negative Cases
- Duplicate provider item.
- Malformed RSS.
- Deleted or missing HN item.
- Provider timeout during scan.

## Regression Coverage
- Connector certification suite.
- Normalized feed snapshots.
- Cursor crash/retry cases.
- Provider error taxonomy cases.

## Residual Risks
- Reddit/X/Telegram remain future adapters.
- Advanced source-specific dashboards can be deferred.

## Approvers
- Ingestion lead.
- QA owner.
- Source policy owner.
- Operations owner.
