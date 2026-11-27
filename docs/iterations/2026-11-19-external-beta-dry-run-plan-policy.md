# 2026-11-19 · External beta dry-run contract/plan extraction

## Scope

Move the existing two original functions \`validateDryRunContract\` and \`validatePlanShape\` from \`scripts/check-external-beta-evidence-dry-run.mjs\` into a dedicated E2E-only policy. Preserve all 95 original nonblank source lines (indentation-only changes) and their invocation order. No changes to live execution, secrets, production, release state, dependency audit or other PR branches. Original implementation line credit: **0 pending merge + main native E2E**; tests/new glue/docs: **0**.

## Four review passes

1. **Scope/SRP:** policy owns only the static dry-run contract and the credential-free runner plan; handoff/safety/readiness/artifact validation remain in the current runner. No new abstractions beyond one factory for existing live dependencies.
2. **Behavior:** unmodified original if/for diagnostics, command-pair ordering, exact path checks, set equality, required job gates and fail-closed no-credential rules. Existing \`violations\` array and \`assertSameSet\` are injected, not replaced.
3. **Security:** \`plan_only\`, external-beta blocking, absent credentials, \`--execute\` guard, \`run-live\` confirmation and existing shell environment remain unchanged.
4. **Regression/E2E:** five deterministic behavior/wiring tests are added to existing architecture check. Draft checks must complete, then independent review, Ready native 20/20 + nonpublishing image and postmerge main 20/20 + image before credit. Skipped/queued/cancelled are not PASS.

## Concurrent work

This slice does not touch #665 model code or #776 polling/#781 negative smoke source, but their competing edits to \`package.json\` architecture commands must ALL be preserved during later reconciliation. Respect the existing security HOLD before any merge; do not extend expired exceptions or bypass the audit. No deploy.
