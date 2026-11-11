# External-beta env readiness extraction — 2026-11-11

## Pinned source and ownership
Base main `c2ea8b7b8b33786b1ce5580c59a3bd5d29fac54b`. Move 13 existing environment-readiness and missing-required-env-formatting functions
from `scripts/external-beta-evidence-runner.mjs` into one small module.
Exact original source 4215/4215 characters reconstruct after reversing only factory indentation;
100 nonblank original physical source lines, of which 59 are conservative implementation-bearing
lines when standalone braces and signatures are discounted. These are *relocated*, never net deletions.
CLI physical lines 1420 -> 1310; preserve and tighten only its legacy cap.

## Three independent critique rounds
1. SOLID/SRP: CLI remains sole owner of input selection, environment loading, execution, artifact IO,
   console output and process exits. Helper handles existing availability/readiness decisions only.
   No new store, network, filesystem, dependency, feature flag or production behavior.
2. Security/behavior: original bodies untouched; original process object injected (not env snapshot)
   to preserve lookup timing, original local-runtime classifier callbacks retained, exact diagnostic
   text, captured-artifact exclusions and fallback priority preserved.
3. Test/coordination: deterministic positive/negative and mutation-based AST tests are wired into
   the original bounded 300s checker suite, not a replacement. Shared package and line-cap files
   require merge reconciliation with owned #740/#744. Independent model-owner #665 untouched.

## Acceptance
Draft 3/3 Static/Security/Flutter + nonpublishing image, independent review and fixes,
Ready original exact-head 20/20, SHA-guarded squash merge and native postmerge main 20/20.
Until then all source LOC are provisional; do not deploy production or override SSH.

## Real first-Draft CI finding and minimal follow-up
Original Static #43050109529 failed 6 of 973 tests: the existing independent
`validateRunnerImplementationMarkers` still expected nine environment/readiness
markers in the old CLI after they moved to the new helper. This update re-homes
all nine marker checks to the actual helper source, without removing any marker;
checker reads the real file and added negative mutation tests prove every guard
stays fail-closed. The 13 original function bodies and their LOC ledger remain unchanged.
