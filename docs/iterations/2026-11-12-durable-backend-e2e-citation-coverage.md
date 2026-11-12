# Durable backend E2E — citation coverage SRP extraction

Baseline: `794c7fbe5eee351f0ee809c66563a772d9ded299` (`main`, 2026-11-12). Owner: new isolated PR branch `refactor/durable-backend-citation-coverage-20261112-11`.

## Scope and counting
- Move exactly **37 unique nonblank original function LOC** (two existing functions) and **6 original type LOC** from `scripts/capture-durable-backend-e2e-loop.ts` into `scripts/lib/durable-backend-e2e-citation-coverage.ts`. These are *relocated*, not net deletions.
- Preserve both source bodies, diagnostics, sorting, deduplication, threshold math and the two live call sites (summary + reader brief) without semantic changes. The existing citation threshold counts all cited keys, including unexpected keys; correcting that behavior would be a separate scope with its own contract and approval.
- Only reduce the original source cap `1906 → 1864`; never relax security, architecture, staging or CI guards.
- Add focused deterministic positive and negative tests, wired into the existing `check:architecture`. No network, production, database, SSH, credentials, deployment or changes to #665/#750.

## Review checkpoints
1. **Boundary:** pure coverage computation and fail-fast assertion belong together; keep IO and orchestration in the runner. No new store, framework, service or duplicated state.
2. **Behavior:** reversible source reconstruction must equal baseline byte-for-byte after undoing new imports/exports, and both original callers must remain executable. Do not broaden validation behavior.
3. **Security:** preserve original fail-fast diagnostic path and existing checks; mutation tests reject missing/renamed calls and duplicate helpers. Do not count queued/skipped as PASS.

## Acceptance
Draft CI Static/Security/Flutter + focused tests; independent source/structural review; unchanged exact HEAD Ready E2E **20/20**; SHA-guarded safe merge; naturally triggered postmerge `main` **20/20**. Count the **37 original function LOC** once only after full acceptance. Existing production-deploy #620 and model-owner #665 are out of scope.
