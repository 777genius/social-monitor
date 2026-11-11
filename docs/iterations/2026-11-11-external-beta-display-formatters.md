# External beta display formatters — 2026-11-11

## Source and scope
Move **73 unique original nonblank LOC** (81 physical lines) of seven cohesive, pure plan/handoff formatting functions out of `scripts/external-beta-evidence-runner.mjs` and into `scripts/lib/external-beta-evidence-display-formatters.mjs`. This is **original-source relocation, not net deletion**. Keep commands, IO, environment parsing, validation, redaction, CLI option ordering, and live-execution guards exactly unchanged.

## Boundary critique
1. **SRP / dependency direction:** the executable script owns orchestration, command execution and validated contract loading; one factory owns only display metadata and text projection. Inject the already-loaded contract and input matrix. No new store, feature flag or API.
2. **Behavior:** move the seven original function bodies without changing a single logical line; the nested factory only adds indentation and returns those functions. Keep their original late/lazy reads of the loaded objects (especially fresh `Map` construction on each call), explicit-override precedence, exact fallback text, and ordering.
3. **Safety and testing:** preserve all existing static marker and handoff checks, with a new TypeScript AST gate requiring a single actual top-level factory delegation and negative dormant/forged mutations. Include seven unit/fallback tests in the canonical `check:external-beta-evidence-runner` suite. Ratchet only original source cap **1640 → 1564 physical lines**, preserving strict global cap and full 300s checker.

## Acceptance
Original Draft checks + non-publishing API image, independently inspect diff and source preservation, then exact-head Ready 20/20 E2E, expected-SHA squash merge and real postmerge main 20/20. Avoid changes to independent #728/#665 and deferred production/SSH. Shared package/source-cap rows must be reconciled with any concurrent main advance before merge.
