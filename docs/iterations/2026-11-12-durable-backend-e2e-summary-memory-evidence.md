# Durable backend E2E — summary-memory evidence projection

Base main: `67558008886148ca9707ecb16b21e9ed2e7b51e8` (2026-11-12). Scoped branch: `refactor/durable-backend-e2e-summary-memory-evidence-20261112-15`.

## Boundary

Relocate **110 unique nonblank original function LOC**, plus **13 original type LOC** (123 total source lines including type declarations; not net deletion). Extract only the pure `summaryMemoryEvidenceSnapshot`, `safeMemoryContextDebug`, `numberOrUndefined`, `stringArrayOrUndefined`, `safeUrlOrigin` and `SummaryMemoryEvidence` to `scripts/lib/durable-backend-e2e-summary-memory-evidence.ts`. Poll loop, DB, memo-stack client, network, auth, timers and all IO remain in the CLI. The only changed argument is explicit read-only `config` to replace the former implicit global dependency; all original function bodies and diagnostic projections otherwise remain intact.

Ratchet only `scripts/capture-durable-backend-e2e-loop.ts` source debt **1864 → 1742 physical lines**. One focused `.test.mjs` is wired into the existing `check:architecture` chain, preserving the #756 citation and #757 technical-leak regression gates.

## Four structural review rounds

1. Responsibility and dependency direction: one pure sibling projection, no duplicate state, no second adapter or framework.
2. Behavior: move the exact legacy bodies; preserve status, sourceRef matching, dedup/sort, locale case, diagnostic coercion, URL origin redaction, returned report shape and original invocation timing.
3. Adversarial tests: unavailable/no match, all positive evidence alternatives, malformed diagnostics, privacy, nonmutation, AST-backed disabled-call and duplicated-owner rejection.
4. Integration and safety: no model #665, CI #750, production #620, SSH, deployments, new credentials, relaxed checks or source cap exceptions. Original runner's bounded polling path remains in control.

## Acceptance

Focused tests and hosted Draft Static/Security/Flutter plus image, independent review, exact-head Ready **20/20**, SHA-guarded merge, and naturally triggered main push **20/20**. Count conservative 110 relocated original function LOC once only after full postmerge acceptance.
