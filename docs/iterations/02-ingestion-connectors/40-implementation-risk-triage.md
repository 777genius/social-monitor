# Iteration 02 - Implementation Risk Triage

## Triage Goal
Detect ingestion risks before downstream feed and summary logic depends on unstable data.

## Critical Risks
- Provider-specific payload leaks into feed domain.
- Cursor advances before durable persistence.
- Connector behavior differs across sources without certification.
- Unsupported high-risk scraping is treated as production path.

## Early Warning Signals
- Summary or mobile tickets request provider-specific fields.
- Adapter tests are source-specific instead of shared.
- Retry behavior is not deterministic.
- Feed items lack stable provenance.

## Owners
- Ingestion lead owns provider port and adapter behavior.
- QA owner owns certification tests.
- Backend lead owns normalized feed schema.
- Source policy owner owns source approval state.

## Mitigations
- Run every adapter through shared certification.
- Commit cursor only after persisted items and outbox state.
- Normalize provider errors into stable taxonomy.
- Block unsupported source strategies through policy gate.

## Stop-Work Triggers
- New adapter cannot pass certification.
- Feed schema requires provider-specific fields.
- Cursor behavior cannot be explained for crash/retry cases.

## MVP Risk Cutline
- Fix now: cursor safety, provider certification, normalized identity, provenance and source policy approval.
- Carry with owner: RSS canonicalization tuning and HN comment scope.
- Defer: Reddit/X/Telegram implementation until readiness profile and beta demand justify it.
