# Iteration 02 - Traceability Matrix

| Goal | Phase | Ticket Area | Contract/Artifact | Tests/Checks | Done Evidence |
| --- | --- | --- | --- | --- | --- |
| Build connector SDK | 01-connector-sdk | Ingestion SDK | SourceProviderPort, capability profile | Certification tests | Fake provider passes |
| Add first providers | 02-hn-rss-implementation | Provider adapters | HN/RSS adapters | Fixture tests | HN/RSS normalized items |
| Schedule scans | 03-scheduler-and-jobs | Workers/jobs | Scan policy, job commands | Lease/retry tests | Repeated scheduled scans |
| Build feed model | 04-feed-dedupe-read-model | Feed | Normalized item, dedupe schema | Dedupe tests | Tenant feed with provenance |
| Preserve source safety | 01-connector-sdk | Source policy | Risk class, capability profile | Source review | No unsafe connector path |

## Unmapped Risk Check

- Cursor data loss maps to cursor discipline tests.
- Duplicate feed items map to dedupe checks.
- Provider failure maps to error taxonomy and dead-letter.
- Source expansion risk maps to certification gate.
