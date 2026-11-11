# External-beta artifact consistency and freshness SRP — 2026-11-11

## Scope and provenance
Starting from main `c242a92df2c56f66f1ddbe05fba2c610f7a1a899`, move the seven contiguous original helpers for artifact environment identity and freshness from `scripts/external-beta-evidence-runner.mjs` to `scripts/lib/external-beta-artifact-consistency-freshness.mjs`. These are **133 original nonblank implementation LOC relocated**, **not net deletion**. All seven original function definitions and bodies retain their exact source bytes once the two-space factory indentation is reversed. Baseline file blob `e82bfc8a1dbff07e8c7e2b07be2714c43134953e`, original 1564 physical LOC, new 1420. Ratchet only this legacy source-line debt cap 1564 → 1420 (the global 1000-LOC policy remains).

## Single responsibility
The CLI remains owner of contract loading, environment selection, job orchestration, artifact reading and diagnostics. The new module only validates loaded content against environment identity and artifact freshness. Inject the existing `contract`, `process` and `Date` references once to retain the original late-bound `process.env` and `Date.now()` expressions in-place; no import-time filesystem, network or new runtime I/O. Existing calls remain in original sequence after JSON artifact parsing and redaction/identity/provider-key checks.

## Critique / validation
- **Behavior:** independently compare original seven functions verbatim (indentation normalized only), ensure malformed/absent env and timestamps remain fail-closed with identical error text, and keep Reddit credential lifecycle digest/commit exemption.
- **Architecture:** one top-level live factory binding, no duplicate function owner, seven moved functions cohesive, no new state store, feature flag or dependency.
- **Security:** verify the original 300s-bounded checker, artifact redaction, secret checks, path validation, staging gates and source cap; do not weaken or bypass. Node deterministic synthetic negative tests for missing env, mismatches, future/old/non-ISO timestamps and invalid policy.
- **Conflict control:** check other open PRs; disjoint from independently owned #740 source-provider and #665 model-adapter refactors. No production deploy, SSH or release changes.

## Acceptance
New Draft CI (Static/Security/Flutter), nonpublishing image, independent code/review inspection, exact-head Ready native 20/20, expected-SHA squash merge, main postmerge 20/20. Counts provisional until final acceptance.
