# Iteration 02 - Executive Brief

## Goal

Build reliable scheduled ingestion with HN/RSS, connector SDK, worker jobs, normalized feed, dedupe and provenance.

## Main Risk

Data loss or duplicate/noisy feed caused by weak cursor, retry, dedupe or provider failure handling.

## Required Outputs

- Source provider port and capability profile.
- Connector certification tests.
- HN/RSS adapters.
- Scheduler and worker lease.
- Normalized feed and dedupe.
- Source provenance.

## Stop Gate

Do not start AI summaries until repeated scans produce deduped, tenant-scoped feed items with provenance.

## Next Transition

Move to `03-ai-summary-intelligence` when ingestion output is reliable enough to cite.
