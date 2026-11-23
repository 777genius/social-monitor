# Release deploy artifact path smoke separation — 2026-11-11

## Goal and approved scope
Behavior-preserving SRP extraction of 109 unique original nonblank implementation LOC (115 physical lines) from `scripts/check-release-artifact-evidence.mjs` into `scripts/lib/release-deploy-artifact-path-smokes.mjs`, not a claim of net deletion. The four cohesive functions perform capture workspace-path rejection and direct self-check of workspace/private mode policies. No production, deployment, auth, SSH, schema or external dependency changes.

## Critical reviews
1. **Behavior/ordering**: preserve child `execFileSync` executable, arguments, inherited environment, overrides, stdout+stderr diagnostics, `0600` creation then `0644` negative fixture, `finally` cleanup, recursion guard and all existing caller invocation ordering. Inject dependencies without executing IO in factory creation.
2. **Source/SOLID**: isolate a single concern in a one-owner module. Source is verbatim after removing only two added indentation spaces: 115/115 original lines. Preserve existing `validateCaptureScriptWiring` and direct-call checks. The original checker drops beneath the strict general 1,000-line cap; no line-cap exception or bypass.
3. **Negative testing**: deterministic synthetic child-process harness covers accepted rejection, unexpected success, missing diagnostic, created forbidden artifacts, recursion, file permissions, cleanup, env and call order. Original full checker still runs after the tests. No fake approval from rate-limited bots.
4. **Concurrent boundaries**: own `check-release-artifact-evidence` only; #728 owns staging, #665 owns summary models. `package.json` is shared metadata, but a separate script key. Re-check latest main and original exact-head CI before Ready or merge.

## Qualification
Draft Security/Static/Flutter and non-publishing image; independent source/security review; real Ready 20/20 exact-head; guarded squash merge and natural main push 20/20. Do not count LOC until fully accepted.
