# Source-live smoke script contracts — 2026-11-11

## Scope / provenance
Extract **220 unique original nonblank implementation LOC** from the 12-file source-live smoke script inspection and its required-signal helper into `scripts/lib/source-live-smoke-script-contracts.mjs`. The original validator still owns orchestration and invokes the two pre-existing artifact-path guard smokes directly, in exactly their original order. The extracted inspector reads each tracked script at the original invocation time, not at import or factory creation. Preserve all error text, policy checks, secret-exclusion assertions and failure behavior. This counts relocated original code, **not net deletion**.

## Design and critique
1. **SRP / dependency direction:** CLI retains sequencing, reporting and existing artifact-path guard ownership. One injected helper owns only source-file contract inspection; all path values and readFileSync are injected once. No new persistent store or duplicate validation.
2. **Behavior / safety:** Retain verbatim marker checks, Reddit OAuth refresh-token rules, 0600 private artifact constraints and fail-closed missing-signal behavior. No SSH, production deployment, auth changes, or altered command timing. Negative mutation cases must still fail.
3. **Minimal testing:** Eight deterministic tests check deferred IO, 12 exact reads, missing marker and signal diagnoses, forbidden skip and read exceptions. Keep the pre-existing AST path-guard gate and entire canonical source certification command. Strict legacy file cap 1292 → 1078 physical lines. No feature flags.

## Acceptance
Draft tests and source certification / source-cap checks, independent structural critique, genuine exact-head 20-job Ready E2E and non-publishing image, SHA-guarded squash merge, then natural main push E2E 20/20. Credit the 220 unique original LOC only after post-merge qualification. Avoid #665 model adapter and unrelated #620/#724/#726 owners.
