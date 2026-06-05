# Iteration 02 - Build Order Checklist

## Build Order

1. Define `SourceProviderPort`.
2. Define capability profile.
3. Define provider error taxonomy.
4. Define connector certification tests.
5. Implement fake provider.
6. Implement provider registry.
7. Implement HN adapter.
8. Implement RSS adapter.
9. Add fixture tests.
10. Implement scan policy aggregate.
11. Implement scheduler.
12. Implement worker lease.
13. Implement retry/backoff/dead-letter.
14. Implement cursor discipline.
15. Persist normalized source items.
16. Implement dedupe.
17. Build feed read model.
18. Expose feed REST endpoints.
19. Add readiness profiles for Reddit, X/Twitter, Telegram, GitHub and YouTube without enabling scans.
20. Add source health/status endpoints for limited, unavailable, paused and failed states.

## First PR Sequence

1. PR 1: source catalog primitives, provider key, capability profile, readiness profile.
2. PR 2: `SourceProviderPort`, fake provider and certification harness.
3. PR 3: normalized item schema, cursor schema and provider error taxonomy.
4. PR 4: HN adapter with fixtures and certification.
5. PR 5: RSS adapter with fixtures, ETag/Last-Modified and certification.
6. PR 6: scan policy, job creation, lease and retry/dead-letter skeleton.
7. PR 7: worker execution, cursor commit discipline and crash/retry tests.
8. PR 8: source item persistence, dedupe and feed read model.
9. PR 9: feed/source health REST endpoints and operation status.
10. PR 10: future-source readiness records and ADRs.

## Contracts First

- Source provider port.
- Normalized item schema.
- Scan job event/command.
- Feed read model API.
- Provider capability profile.
- Source readiness profile.
- Provider failure taxonomy.
- Cursor schema/version contract.
- Source health API states.

## Tests And Checks

- Provider certification tests.
- Repeated scan idempotency.
- Duplicate URL/content dedupe.
- Worker crash simulation.
- Tenant-scoped feed query.
- Cursor commit crash-before/after persistence.
- Adapter DTO leakage check.
- Source limitation and health mapping tests.
- Manual scan vs scheduled scan overlap.
- Quota preflight before provider call.

## Edge Cases Before Closure

- RSS without GUID.
- HN story without URL.
- Provider cursor expires.
- Topic deleted while job queued.
- Same item appears across sources.
- Source binding disabled while worker holds lease.
- Provider returns success with partial/malformed page.
- Capability profile changes while bindings exist.
- Same public item appears in two tenants.

## Closure

Close only when scheduled HN/RSS scans produce deduped feed items with provenance.
