# Staging capture-path smoke SRP extraction — 2026-11-11

## Boundary and scope
Relocate **117 unique original nonblank implementation LOC** (121 physical lines) from three cohesive functions in `scripts/check-staging-reliability-evidence.mjs` to `scripts/lib/staging-reliability-capture-path-smokes.mjs`. Count relocation, not net deletion. Keep the direct artifact-path guard and self-recursion protections in the original checker. No production, SSH, deployment, auth or configuration changes.

## Three critical reviews
1. **Behavior/ordering:** Same capture commands, environment inheritance, stderr+stdout matching, rejection diagnostics, workspace non-creation checks, execution timing, and subsequent direct guards. Factory creation performs no IO; callers execute exactly once in their old order.
2. **Architecture/security:** Pass existing IO/runtime/paths and violations via injection, no duplicate stores, no changes to workspace or 0600 policies. Static negative mutation tests reject missing/commented/dormant delegation. No bypass of other gates.
3. **Evidence/coordination:** Reversibly restore one indentation level and compare source 121/121 physical lines byte-for-byte. Ratchet only the original checker source cap **1196 → 1079**, preserving the universal cap. Share package/line-cap policy files with active independent #727: do not merge until latest base/ownership is reconciled and exact-head checks independently pass.

## Qualification
New deterministic positive/negative unit tests belong to existing `check:staging-reliability-evidence`. Run canonical original Draft CI and nonpublishing API image, resolve independent reviews, Ready 20/20 on exact SHA, SHA-guarded squash merge, then natural postmerge `main` 20/20. Never claim success from queued/skipped jobs.
