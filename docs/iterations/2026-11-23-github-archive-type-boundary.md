# Stage B2 — consumer-owned GitHub Trending archive snapshot

Status: **Draft / not merge-ready**. Stacked on Stage B1 (#791), itself stacked on Stage A (#790). This change must not be merged or retargeted before its parents have final native E2E, independent reviews and merged main.

## Problem and ownership

`libs/summary/domain/policies/reader-summary-github-projection-audit-types.ts` imports `GitHubTrendingArchiveMetadata` from `@social-monitor/ingestion/domain` solely as a type. This makes the Summary domain depend on an Ingestion domain alias. The separate `reader-summary-github-archived-projection.ts` has a *runtime* parser and external-ID reference to Ingestion; that behavior is out of scope. Keep it in the exact historical exception list.

## Included scope

1. Introduce one summary-owned immutable `ReaderSummaryGithubArchiveSnapshot` and `ReaderSummaryGithubArchiveProvenance` type in a small domain policy module. Mirror the existing admitted structure only: discriminator, archive provenance, repository and trending identity/metrics, nullable scan/fetch/checkedAt fields.
2. Replace the **single type-only** import in `reader-summary-github-projection-audit-types.ts`. No exported property is removed or renamed, and the old production runtime parser retains full custody and validation.
3. In adapter-level Jest, assert bidirectional structural assignability to `GitHubTrendingArchiveMetadata` and test that values can pass through with identical reference identity (no normalization or copying). The compile-time parity of both directions must catch a changed field or narrower union.
4. Retire **only** the exact type-only source+specifier historical allowlist entry. The runtime `reader-summary-github-archived-projection.ts` exception remains.
5. Update the shared architecture plan with the new Stage B2 delta (Stage A 10-edge frozen baseline, Stage B1 7, Stage B2 6). Add a negative architecture fixture for the retired edge and keep the existing positive runtime fixture.
6. Preserve all existing telemetry, provider identity, UTC day, archive custody and publication verification semantics.

## Excluded scope

No change to `libs/ingestion`, archived projection runtime, event or database wire schema, tests relying on live GitHub data, application dependency injection, provider selection, licenses, prompts, secret handling, `package.json`, lockfile, Node/TS versions, production deploy, or #665's model adapters.

## Review & verification criteria

- Domain / DDD: the snapshot is a consumer *view*; parsing and source validation remain with Ingestion. No shared-kernel dumping ground or duplicate runtime validator.
- Compatibility: two-way TypeScript assignability; data/reference-preserving adapter test; all `trending` and `archive` fields retained with exact literals, nullability and optionality.
- Security: no fake archive provenance, no timestamp rewriting and no changes to fail-closed archive verification.
- Architecture: exactly one additional source+specifier exception removed; do not broaden any exception or weaken existing scanners.
- Regression: focused Jest plus real `npm ci`, `npx tsc --noEmit`, `npm run check:architecture`, source cap, full native PG18/backend E2E, security and independent final-head reviews; skipped/queued/cancelled are not PASS.
- Integration: merge Stage A #790, then Stage B1 #791, then retarget this PR onto the *current* `main`, qualify exact final HEAD and squash merge with postmerge verification. Stop if a current-main fix conflicts.

## Limits

This is not a runtime refactor or a meaningful 10,000-implementation-line claim. No code credited for documentation/tests or relocated unchanged types. Do not rush the full environment/type-toolchain migration into this PR.
