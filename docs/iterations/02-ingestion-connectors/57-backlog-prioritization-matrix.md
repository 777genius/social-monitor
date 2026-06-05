# Iteration 02 - Backlog Prioritization Matrix

## Prioritization Goal
Make ingestion reliable and normalized before expanding source count.

## P0 - Do First
- SourceProviderPort.
- Capability profile.
- Certification suite.
- Fake provider.
- Cursor semantics.
- Normalized feed schema.

## P1 - Do After P0
- HN adapter.
- RSS adapter.
- Scheduler and worker lease.
- Provider error taxonomy.
- Scan status events.

## P2 - Defer If Needed
- Reddit adapter.
- X/Twitter adapter.
- Telegram adapter.
- Advanced source dashboards.

## Prioritize Higher When
- Work affects feed schema.
- Work affects cursor safety.
- Work affects provider-neutral downstream contracts.
- Work affects source policy compliance.

## Do Not Prioritize
- New sources before certification.
- Source count before provenance quality.
- Provider-specific fields before normalized domain.
