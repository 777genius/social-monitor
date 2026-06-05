# Iteration 02 - Sprint Zero Bootstrap

## Bootstrap Goal
Prepare ingestion implementation before adapters or scheduler code starts.

## Setup Tasks
- Assign ingestion, source policy, feed schema and QA owners.
- Confirm HN/RSS/fake provider MVP scope.
- Confirm certification suite shape.
- Confirm cursor and normalized feed design inputs.

## First Artifacts
- SourceProviderPort draft.
- Capability profile template.
- Connector certification fixture list.
- Normalized feed example.
- Cursor state diagram.

## Preflight Checks
- Every source has policy status.
- Fake provider can simulate duplicates and failures.
- Feed schema includes stable ID and provenance.
- Scheduler behavior has retry/backoff expectations.

## Start Blockers
- Source policy approval missing.
- Normalized feed schema undecided.
- Cursor semantics unclear.
- Certification suite owner missing.
