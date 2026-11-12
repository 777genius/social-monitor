# External Beta artifact identity and provider-key policy — 2026-11-12

Scope: move two pure related artifact-schema validators (51 unique original nonblank LOC) from scripts/external-beta-evidence-runner.mjs into one policy module. Source physical lines 1213 → 1158; tighten only this runner's source cap. LOC moved are not net deletions.

Round 1, architecture: artifact identity/provider membership policy is cohesive; runner retains file I/O, environment, orchestration, redaction, CLI and error accumulation. No new store, abstraction hierarchy or dependency.

Round 2, safety/behavior: original validator bodies retained verbatim apart from export; preserve diagnostics, check order, optional expected fields, provider-key trimming, duplicates, missing and extra detection; no auth, security, SSH, production or deployment changes.

Round 3, tests/E2E/scope: deterministic positive and fail-closed negative tests including original runner/static gate wiring. Keep the original 300s real checker. Requires hosted Draft Static/Security/Flutter, independent structural review, exact-head Ready E2E 20/20, safe SHA-guarded squash merge and postmerge main 20/20. #665 model work, #750 CI runners and #620 deployment untouched. Complexity 2/10, scope 2/10, confidence 8/10 pending hosted CI.
