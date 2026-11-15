# Durable backend E2E PostgreSQL evidence extraction — 2026-11-14

Frozen main: 8fe54f50914ce763fef30fe9d77afdde04d8c90a; original runner blob: eebf4c81bd8ad185ff17720792775f5f5d7dfb9e.
Original exclusive ranges: `seedDurableIdentity` and `durableCounts` 1019–1131, `scheduledScanEvidenceSnapshot` 1225–1291, `autoSummaryEvidenceSnapshot` and `withClient` 1345–1467.

## Critical architecture, behavior and test review

1. **Responsibility:** test-only persistence adapter owns fixture identity seeding, tenant-scoped counting and scheduled/auto SQL evidence snapshots; E2E runner retains workflow polling and configuration. Inject existing Pool; no new instance or production database contract.
2. **Behavior:** SQL literals, placeholders/parameter order, insert/upsert/transaction/rollback, client release, tenant/workspace scopes, selected-row ordering, statuses and date/fallback mappings are copied from original. Only four exports, two explicit injected Pool arguments and associated caller imports change. No security or runtime-mode changes.
3. **Tests/gates:** deterministic fake Pool covers successful seeding and rollback, count/fallback/error, two SQL snapshot projection paths and missing rows, plus AST guard for actual delegation. Register architecture test and ratchet source line cap. No CI/security bypass.

Raw original transferred nonblank source lines: 289. **NOT a credited original LOC figure**: this includes signatures, type-only and structural lines; provenance exclusions and no-overlap acceptance are required. New tests/docs/net deletions excluded. Credit only after exact-head Ready 20/20, independent review/security, guarded merge, postmerge native 20/20 and API image SUCCESS.

#665 remains separately owned and untouched; #620, #750, #710/#711 out of scope/HOLD. No production deploy, SSH, force-push or duplicate CI reruns.
