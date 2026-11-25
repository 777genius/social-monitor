# Iteration 02 - Detailed Execution Plan

## Purpose

Implement ingestion as a reliable source-provider platform.

## Phase 01 - Connector SDK

### Steps

1. Define `SourceProviderPort`.
2. Define `SourceCapabilityProfile`.
3. Define `SourceQuery`.
4. Define `ScanContext`.
5. Define `ScanResult`.
6. Define `ProviderCursor`.
7. Define provider error taxonomy.
8. Define connector certification tests.
9. Create fake connector.
10. Add provider registry.
11. Add source risk classification.
12. Add capability persistence.
13. Add source readiness workflow for future providers.
14. Add certification checklist for paid/provider-backed adapters.

### Port And Adapter Implementation Steps

1. Create provider key and source catalog primitives.
2. Create `SourceProviderPort` with capability, validation, planning, scanning and error classification behavior.
3. Create `SourceCapabilityProfile` with source-visible limitations.
4. Create `SourceReadinessProfile` separate from capability profile.
5. Create fake provider that can simulate every certification scenario.
6. Create certification harness that runs the same checks against fake/HN/RSS.
7. Create adapter mapper tests that fail on provider DTO leakage.
8. Create source health mapper from provider failures to user-visible status.
9. Create feature flag/allowlist for enabling providers per environment/tenant.
10. Create ADR template section for new source enablement.

### Edge Cases

- Provider supports list but not search.
- Provider supports posts but not comments.
- Provider returns media without stable URL.
- Provider cursor expires.
- Provider has per-token and per-app limits.
- Provider access works for personal usage but not for commercial/multi-tenant usage.
- Provider exposes useful data through a paid aggregator with different retention/latency guarantees.
- Source expansion requires UI changes because capability profile is incomplete.
- Source has stable IDs for posts but not comments.
- Source search is available but too expensive for frequent scheduled scans.
- Source data can be fetched, but retention or summarization rights are unclear.
- Source capability changes require existing bindings to keep old behavior until migrated.

### Acceptance Gate

- Fake connector passes certification.
- HN/RSS can use the same port without special domain logic.
- A future source can be classified as approved, provider-only, manual-only or rejected before implementation starts.
- Certification harness can prove adapter behavior without real provider quota for every core scenario.

### Future Source Evaluation Steps

Use this process before Reddit, X/Twitter, Telegram or any new network is added:

1. Classify acquisition path and source risk.
2. Write capability profile.
3. Identify credential ownership and quota model.
4. Define item identity, cursor and dedupe strategy.
5. Define content units in/out of scope.
6. Define user-visible unavailable/limited states.
7. Add provider fixtures or contract sandbox.
8. Run connector certification with fake and provider-specific fixtures.
9. Estimate cost per scan, item and summary.
10. Record ADR and source roadmap decision.
11. Decide whether source is `enabled_beta`, `provider_only`, `manual_only` or `rejected`.
12. Define disable/rollback behavior if provider policy, cost or reliability changes.

## Phase 02 - HN/RSS Implementation

### Steps

1. Implement HN provider using official/open APIs.
2. Implement HN item normalization.
3. Implement HN comments if in MVP scope.
4. Implement RSS feed parser.
5. Support ETag and Last-Modified.
6. Normalize feed item guid/link/title/body/date.
7. Add canonical URL extraction.
8. Add source-specific warnings.
9. Add connector fixture tests.
10. Add provider health checks.

### HN/RSS MVP Rules

1. HN adapter uses official/open API paths and does not depend on browser automation.
2. RSS adapter is feed polling, not generalized website scraping.
3. RSS requests use ETag/Last-Modified where available.
4. Missing RSS GUID falls back to canonical URL, then content hash, with warning in scan result.
5. HN deleted/dead items become unavailable state, not hard worker failure.
6. Provider health shows partial/limited status when comments/backfill are not available.
7. Fixture tests include deleted, malformed, duplicate, reordered and edited items.

### Edge Cases

- RSS feed has no guid.
- Feed item date is missing or malformed.
- HN story deleted or dead.
- HN comments arrive after first scan.
- Feed returns same item with updated content.
- RSS feed changes item GUID while URL remains stable.
- Feed returns items outside requested time window.
- HN story exists but comments API is temporarily unavailable.
- RSS server returns 304 but previous cursor/payload cache is missing.

### Acceptance Gate

- HN and RSS scans produce normalized source items.
- Repeated scans are idempotent.
- Provider health and user-visible limitations are correct for unavailable/partial data.

## Phase 03 - Scheduler And Jobs

### Steps

1. Define scan policy aggregate.
2. Add scan interval validation.
3. Add job creation service.
4. Add RabbitMQ/Kafka decision for scan jobs.
5. Add worker claim lease.
6. Add retry/backoff policy.
7. Add rate-limit budget checks.
8. Add pause/resume source binding.
9. Add scan status transitions.
10. Add dead-letter handling.
11. Add replay-safe job execution.

### Scheduler/Worker Execution Rules

1. Create jobs from enabled source bindings only.
2. Validate scan interval against platform minimum, provider limit and tenant quota.
3. Use lease/fencing token so two workers cannot commit the same job.
4. Re-check topic/source binding enabled state after job claim.
5. Run quota preflight before provider call.
6. Fetch provider data with timeout and retry budget.
7. Persist normalized items and scan attempt state before acknowledging job.
8. Commit cursor only after durable persistence is complete.
9. Publish scan completion/failure through outbox.
10. Dead-letter with failure class, tenant/workspace/source binding and correlation id.

### Edge Cases

- Two workers claim same job.
- Job crashes after provider fetch before cursor save.
- Retry duplicates items.
- Tenant quota is exhausted mid-scan.
- Source disabled while job is queued.
- Manual scan overlaps scheduled scan.
- Worker lease expires during slow provider response.
- Provider returns partial page and cursor for next page.
- Retry happens after capability profile changed.
- Job is replayed after cursor commit but before scan completed event publish.

### Acceptance Gate

- Scheduled scans run repeatedly.
- Failed scans surface actionable status.
- Lease prevents duplicate work.
- Crash-before-cursor and crash-after-persist tests prove no data loss or duplicate user-visible feed rows.

## Phase 04 - Feed Dedupe Read Model

### Steps

1. Define normalized item schema.
2. Define raw metadata storage.
3. Implement dedupe rules:
   - provider id
   - canonical URL
   - content hash
4. Implement topic feed read model.
5. Add pagination.
6. Add filters by source/status/date.
7. Add item detail endpoint.
8. Add source provenance display fields.
9. Add item update handling.
10. Add deletion/unavailable state.

### Dedupe And Provenance Rules

1. Provider id is strongest only within provider/source namespace.
2. Canonical URL removes common tracking parameters and normalizes scheme/host/path carefully.
3. Content hash is fallback evidence, not sole identity when URL/provider id exists.
4. Cross-source dedupe links source observations to one feed item; it does not delete provenance.
5. Item edits update mutable metadata but do not break feed item identity.
6. Unavailable/deleted source items remain traceable if already summarized.
7. Feed pagination uses stable cursor based on created/observed time and feed item id.

### Edge Cases

- Same article appears in RSS and HN.
- URL differs only by tracking params.
- Provider id collision across sources.
- Item title changes after ingestion.
- User deletes topic while items remain.
- Canonicalization accidentally merges two different URLs.
- Content hash changes because provider inserts tracking or counters.
- Feed item is summarized, then source marks it deleted.
- Tenant A and Tenant B ingest the same public item but have separate visibility/quota context.

### Acceptance Gate

- Feed shows deduped, tenant-scoped, source-provenance-rich items.
- Dedupe tests prove no cross-tenant merge and no provenance loss.
