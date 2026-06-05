# Iteration 02 - Anti-Patterns And Forbidden Shortcuts

## Purpose
Prevent ingestion from becoming source-specific scraping code instead of a reliable provider-adapter system.

## Forbidden Shortcuts
- Passing raw provider payloads into feed, summary or mobile domains.
- Advancing cursor before durable persistence.
- Adding a source without capability profile.
- Treating unsupported acquisition paths as production connectors.

## Architecture Anti-Patterns
- Per-source use cases that duplicate pipeline behavior.
- Scheduler calling provider SDKs directly.
- Downstream contracts requiring provider-specific fields.

## Product Anti-Patterns
- Adding more sources before HN/RSS reliability is proven.
- Hiding source failures from users/operators.
- Prioritizing source count over normalized data quality.

## Stop Immediately If
- Adapter cannot pass certification.
- Feed item identity is unstable.
- Source policy blocks the requested acquisition path.
