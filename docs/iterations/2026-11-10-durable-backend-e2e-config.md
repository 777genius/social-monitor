# Durable backend E2E configuration boundary (2026-11-10)

## Goal and scope

Extract **105 unique nonblank original** configuration/type/helper lines from `scripts/capture-durable-backend-e2e-loop.ts` to `scripts/lib/durable-backend-e2e-config.ts`. This is a move, **not net deletion**. Strict cap ratchet: **2111 → 1998** physical lines. The CLI remains the orchestration, network, DB, tenant/workspace and artifact owner.

Files: this plan, one CLI, one new configuration module, one focused deterministic test, `package.json` architecture test command, the strict source line-cap map, and the existing staging checker wiring guard. No production code, model adapters (#665), release/deploy (#620), SSH, CI security skip, or runtime behavior change.

## Extraction and compatibility

- Move original `RunnerConfig`, `loadConfig`, `requireEnv`, `emptyToUndefined`, and `readPositiveIntegerEnv`. No duplicated store or helper implementation.
- Preserve the precise original environment-read order, truthiness, trim rules, default constants, URL/digest/JWT checks and error messages. The default MemoStack timeout remains supplied from the original CLI at its original invocation point via `loadConfig(defaultMemoStackTimeoutMs)`; no eager config reads on module import.
- Existing source targets still call the single exported `emptyToUndefined` implementation for GitHub/Reddit fixture credentials; this is not a separate credential owner.
- Preserve original `main`, auth/JWT signing, DB/HTTP behavior, 429 handling, runtime timings, and all prior test/security gates.

## Three independent review lenses before implementation

1. **Dependency/SRP**: the config module owns only environment parsing and pure validation, exporting a type and one shared trim helper; the CLI continues to own side effects and lifecycle. No overbuilt factory, DI container or new abstraction layer.
2. **Behavior/security**: data remains read at the existing top-level invocation, missing env and invalid JWT prerequisites still fail closed, and min/max numeric checks remain exact. Test-only fixture values are synthetic. No production token or URL changes.
3. **Scope/verification**: enforce one source delegation, deterministic positive/negative tests under original `check:architecture`, unchanged canonical `check:source-line-cap` command and stricter cap. The original Draft Static run #42845219766 exposed a legitimate staging checker guard still expecting the artifact env marker inside the CLI; retain a fail-closed check for the original CLI permissions/call/import and actual `requireEnv` assignment in the extracted module (checker cap 1200 → 1196). Require original Draft 3-job, Ready exact-head full 20-job E2E and API image; reviews/merge and postmerge exact-main 20/20 before counting moved LOC.

Estimates: complexity **3/10**, behavior confidence **9/10 subject to exact-head E2E**, approximately 105 moved nonblank original lines plus deterministic regressions. No line padding or quota-driven edits.

## Acceptance checklist

- [ ] Local or CI deterministic config tests; TypeScript/typecheck and original security checks
- [ ] Draft 3/3, independent structural review, no actionable threads
- [ ] Ready original 20/20 and API image on exact HEAD
- [ ] Safe expected-head merge only with current main and review requirements
- [ ] Natural postmerge current-main full 20/20 and API image, then credit exact moved original LOC once
