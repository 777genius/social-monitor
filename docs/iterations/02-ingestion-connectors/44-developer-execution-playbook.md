# Iteration 02 - Developer Execution Playbook

## Reading Order
1. Read `01-connector-sdk.md`.
2. Read `35-first-sprint-ticket-cut.md`.
3. Read `38-architecture-compliance-audit.md`.
4. Read `40-implementation-risk-triage.md`.
5. Read `41-test-fixtures-and-scenarios.md`.

## PR Slicing
- PR 1: SourceProviderPort and capability profile.
- PR 2: certification test harness.
- PR 3: fake provider.
- PR 4: HN adapter.
- PR 5: RSS adapter.
- PR 6: scheduler, cursor and worker lease behavior.

## Checks Before PR
- Adapter passes shared certification tests.
- Cursor advances only after durable writes.
- Provider errors map to stable taxonomy.
- Normalized feed has provenance and stable IDs.
- Source strategy is policy-approved.

## Evidence To Attach
- Connector certification result.
- Fixture payloads for happy path and malformed/partial data.
- Repeated-scan idempotency proof.
- Dead-letter/error taxonomy example when failure handling changes.
- Source capability profile and approval note.

## Architecture Guardrails
- Provider payloads stay in adapters.
- Summarization and mobile must consume normalized feed only.
- Adding a source must not rewrite ingestion use cases.

## Escalate When
- A source cannot provide stable identity.
- Provider limits force contract changes.
- A requested acquisition path conflicts with source policy.
