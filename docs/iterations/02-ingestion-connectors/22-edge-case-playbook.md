# Iteration 02 - Edge Case Playbook

## Scenario - Cursor Saved Before Items Persist

- Signal: Scan completes but missing items cannot be replayed.
- Validate: Crash worker between fetch and persistence in test.
- Mitigation: Save cursor only after durable normalized write.

## Scenario - Duplicate Items Across Sources

- Signal: Same URL appears multiple times in topic feed.
- Validate: HN/RSS duplicate fixture with tracking params.
- Mitigation: Deduplicate by provider ID, canonical URL and content hash.

## Scenario - Provider Payload Is Malformed

- Signal: Worker crash or unclassified provider error.
- Validate: Malformed fixture tests.
- Mitigation: Classify provider error and dead-letter with context.

## Scenario - Tenant Deletes Topic During Scan

- Signal: Orphan feed items or jobs continue after delete.
- Validate: Queue job, delete topic, then run worker.
- Mitigation: Check binding/topic state before write and mark job cancelled.

## Scenario - Source Binding Disabled While Job Is Leased

- Signal: User disables a source but worker still writes fresh feed items.
- Validate: Claim job, disable binding, then continue worker execution.
- Mitigation: Re-check topic/source binding state after lease claim and before durable writes.

## Scenario - Provider Cursor Expires

- Signal: Repeated scan fails with cursor-invalid or silently skips new items.
- Validate: Expired cursor fixture and provider-specific cursor error mapping.
- Mitigation: classify as cursor_reset_required, use bounded backfill policy and surface source health warning.

## Scenario - Provider Returns Partial Success

- Signal: Some items are valid, scan status is unclear and user sees no actionable health state.
- Validate: fixture with valid items plus malformed/limited page section.
- Mitigation: persist valid normalized items, record warning/failure class and do not advance cursor past uncertain boundary.

## Scenario - Capability Profile Changes After Binding Exists

- Signal: scheduler still creates jobs using unsupported query/cursor assumptions.
- Validate: create binding on profile v1, switch registry to v2 with removed capability.
- Mitigation: bind to capability profile version snapshot and require explicit migration or pause.

## Scenario - Cross-Tenant Dedupe Leak

- Signal: Tenant B sees provenance/status from Tenant A for same public item.
- Validate: ingest same HN/RSS item under two tenants and query each feed.
- Mitigation: dedupe identity includes tenant/workspace visibility boundary; cross-source dedupe is per tenant.

## Scenario - Unsafe Source Expansion Request

- Signal: new source ticket asks to implement adapter before access path, limits and certification fixtures are known.
- Validate: ticket readiness checklist has missing acquisition mode, quota or retention fields.
- Mitigation: keep source in readiness profile, create ADR/research ticket and block production adapter work.
