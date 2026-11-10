# External beta JSON handoff mapping — scoped SRP refactor (2026-11-10)

Baseline: `7fe8ac30043d100e4757e2ab61c8652c91a7371c`. Draft branch: `refactor/external-beta-json-handoff-20261110-0931`.

## Behavior-preserving contract
Move one cohesive JSON handoff projection and five private input/artifact helpers (126 physical, 121 nonblank **original** lines) out of `scripts/external-beta-evidence-runner.mjs` into `scripts/lib/external-beta-evidence-handoff.mjs`. Keep only JSON formatting and stdout in CLI. Dependencies are the same original contract, input matrix, and callback identities; env checks remain lazy (per invocation). No network, file writes, auth, secret values, or production workflow changes. Preserve key names and output ordering. No change to 300s bounded checker or existing security/summary/staging tests.

## Executable tests / acceptance
- Original shape assertions: safety env names-only, runner/matrix metadata, readiness arithmetic, mapped artifact paths and alternative inputs.
- Dynamic-state regression: two invocations with changed env availability must produce different missing flags.
- TypeScript-AST caller guard rejects deleted import, unselected plan, forged dependency, and detached/dead mapping.
- Add test to the existing `check:external-beta-evidence-runner` chain, preserving every existing test; source cap tightened exactly `1756 -> 1640` physical lines.
- Draft original three required jobs; independent review and fixes; Ready native exact-head 20/20, same-head API image; SHA-guarded merge and **postmerge** current-main 20/20. No production deployment or SSH override.

## Three critique passes
1. **SRP:** Handoff projection is data-only; neither CLI mode selection nor stdout leaves the caller. No new store, framework, or abstractions.
2. **Behavior/security:** Preserve original function bodies and callback evaluation timing, property ordering, env redaction and private artifact metadata. Do not loosen guards or infer live deployment from fixture smoke.
3. **Scope/tests:** Only five files plus this plan; dedicated positive/negative regression, stronger original source cap. Count **126 physical relocated unique legacy LOC**, not net deletion; accept only after merged and postmerge CI.

Never touch independent #665 model-owner work, production #620, Hetzner SSH or concurrent PR ownership.
