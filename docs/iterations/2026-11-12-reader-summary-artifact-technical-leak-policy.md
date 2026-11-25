# Reader summary artifact technical leakage — scoped SRP extraction

Baseline: `794c7fbe5eee351f0ee809c66563a772d9ded299` (main, 2026-11-12). Isolated source: `scripts/check-yesterday-reader-summary-artifact-quality.ts`; no overlap with #756 citation, #750 CI or #665 models.

## Scope and boundaries

- Relocate **72 unique original nonblank LOC**: 61 lines in `collectUserFacingTechnicalLeaks` / `countUiPayloadTechnicalTags`, plus 11 lines in `technicalLeakPatterns`. This is not net deletion.
- Pure sibling module `scripts/lib/reader-summary-artifact-technical-leak-policy.ts`; the original `buildReport` call sites and report shape remain unchanged.
- Preserve regex literals, matching order, case sensitivity, diagnostic values, non-mutating behavior and TypeScript signatures byte-for-byte except necessary `export` keywords; no DB, network, security, UI or production behavior changes.
- Existing 1000-line hard cap remains strict; original runner is 945 physical lines and must shrink. No allowlist exceptions, no new runtime dependency.

## Four review checkpoints

1. **Responsibility:** two helpers detect internal technical leakage in user-facing artifact output; the regex inventory belongs alongside its consumer. Leave engagement metrics, source quality, quality gates and orchestration in the runner.
2. **Behavior:** reconstruct original source byte-for-byte by reversing import, exports and relocation. Verify the two active original call positions via AST, not identifier text alone.
3. **Adversarial tests:** cover nine original technical marker patterns, clean input, uppercase/prefix boundaries, empty fields, nonmutation and tag counts; reject missing import, duplicate owner and removed/renamed/commented-out calls.
4. **Integration and security:** wire test into the existing `check:architecture`; preserve bounded original checks and all Security/Static/Flutter/native E2E. No SSH, deploy, bypass or concurrent branch modification.

## Acceptance

Draft focused tests and original hosted Static/Security/Flutter; independent review; exact-head Ready 20/20; SHA-guarded safe squash merge; naturally triggered postmerge main 20/20. Count 72 unique relocated LOC only after acceptance. No production deployment.
