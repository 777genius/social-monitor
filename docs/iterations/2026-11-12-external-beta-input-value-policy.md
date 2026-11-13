# External Beta evidence input value policy — 2026-11-12

## Scope
Move the 11 original related environment-name sets and input-value/secret-reference classifier functions (99 original nonblank LOC) from `scripts/external-beta-evidence-runner.mjs` to `scripts/lib/external-beta-evidence-input-value-policy.mjs`. Keep their bodies unchanged except `export`; the runner imports the exact named functions. Original runner source cap 1310→1213 physical lines; moved original LOC are not net deleted LOC.

## Architecture critique (round 1)
This is one cohesive pure input validation/classification boundary, not a new data store. Existing side effects (filesystem, actual env reads, credential handling and CLI) remain in the runner. Each Set is created on demand as before. No additional injection interface or abstraction hierarchy is introduced.

## Behavior critique (round 2)
Preserve each exact environment name, case folding, URL classification, placeholder token, fixture hostname, raw secret reference substring behavior and original positive/negative diagnostic flow. A Node URL import in the extracted module resolves the same built-in constructor. The already initialized imported functions replace previously hoisted top-level declarations; no initialization-time side effect is introduced.

## Security, testing and overlap critique (round 3)
Test all 11 exports with deterministic safe synthetic inputs; validate new import and absence of duplicated old functions. Register the test before the existing original 300s bounded checker, never replace the checker or disable its security/identity markers. Ratchet only this script's physical source cap. Do not touch #665 model adapters, #750 CI runners, #753 release stabilization, production #620, SSH or deployment. Preserve fail-closed token and secret-reference guards.

## Acceptance
Draft PR only until original focused tests and Static/Security/Flutter CI succeed, independent structural review and exact Ready HEAD full 20/20 are obtained. Only then SHA-checked safe merge and actual postmerge main 20/20; queued/skipped are not PASS. No production deployment.
