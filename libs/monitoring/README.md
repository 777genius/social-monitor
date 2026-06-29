# Monitoring Context

Owns interests, source bindings, source credentials, scan policy and scan request
coordination.

## Ubiquitous Language

- `Interest`: monitored intent/rule group.
- `SourceBinding`: workspace/interest connection to a provider source.
- `ScanPolicy`: cadence, quota and scheduling policy for scans.
- `ScanExecution`: monitoring-side record of requested/completed scan work.

## Context Rules

- Monitoring decides what should be scanned and when.
- Ingestion executes scans and produces source items.
- Summary and Feed must not mutate source bindings or scan policy directly.

Layout is fixed as:

- `domain`
- `features`
- `ports`
- `adapters`
- `interfaces`
