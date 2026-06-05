# Iteration 02 - Contract Dependency Checklist

## Purpose
Make ingestion contracts stable enough for feed, summarization and mobile status to depend on them.

## Input Dependencies
- Source policy and approved source list.
- Outbox/idempotency contract.
- Tenant-scoped topic/source binding APIs.
- Provider error taxonomy baseline.

## Output Contracts
- SourceProviderPort contract.
- Connector capability profile.
- Normalized feed item schema.
- Cursor persistence semantics.
- Scan status events.

## Owners
- Ingestion lead owns provider port and capability profile.
- Backend lead owns feed schema and scan events.
- QA owner owns connector certification contract.
- Operations owner owns failure/status visibility.

## Breaking-Change Risks
- Normalized feed schema changes after summary pipeline starts.
- Cursor semantics change after scheduler deployment.
- Provider-specific fields become required by downstream consumers.
- Scan status event names change after mobile integration.

## Transition Readiness
- Iteration 03 can summarize using normalized feed only.
- Feed items have stable IDs and provenance.
- Connector certification catches contract violations before new sources are added.
