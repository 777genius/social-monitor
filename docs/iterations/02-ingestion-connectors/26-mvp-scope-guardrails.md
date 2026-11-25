# Iteration 02 - MVP Scope Guardrails

## In Scope

1. Connector SDK.
2. HN adapter.
3. RSS adapter.
4. Scheduler and workers.
5. Normalized feed and dedupe.
6. Source provenance.

## Out Of Scope

1. High-risk social adapters without approved provider path.
2. Browser automation as production connector.
3. Full historical backfill platform.
4. Advanced semantic clustering beyond MVP dedupe.

## Scope Creep Signals

- New source request appears before SDK certification is stable.
- Adapter-specific logic leaks into feed domain.
- Backfill work delays recurring scans.

## Decision Rule

Accept ingestion work only if it improves reliable scheduled scans and normalized feed quality.

## Complexity Budget

- Build deeply: connector SDK, fake provider, HN/RSS adapters, scheduler, cursor safety, retry/DLQ, dedupe and provenance.
- Define lightly: Reddit/X/Telegram readiness profiles, paid/provider adapter criteria and future backfill interface.
- Defer: broad social expansion, unrestricted historical backfill, advanced clustering and provider-specific UI beyond capability display.
