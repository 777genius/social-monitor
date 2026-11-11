# External beta preflight smoke commands — 2026-11-11

## Scope and source provenance
Extract exactly **117 unique original nonblank implementation LOC** across four preflight command functions into one dependency-injected helper. Preserve the original function statements after reversible two-space indentation; no second implementation, new IO, auth, production deploy, or SSH. Preserve existing failure diagnostics, execution-time PATH, the 30-second child timeout, stderr redaction, and finally cleanup. Ratchet original CLI source cap **1175 → 1068**; moved LOC must not be counted as net deletions.

## Critique and acceptance
1. **SOLID:** runner checker remains responsible for orchestration and violations; helper owns preflight child execution and scenario validation only. No new persistent state or source of truth.
2. **Security:** no escalation, environment inheritance, new endpoints or secrets; original child arguments and error handling preserved, and temporary directories always cleaned.
3. **Behavior/tests:** eight new deterministic tests cover negative rejection and diagnostics, positive ordinary/Reddit alternatives, timeout/argv/env contracts and cleanup. Original test, source-cap and security gates stay enabled.

Draft 3/3 + image → independent source/structural review and fix findings → exact HEAD Ready native 20/20 → CAS squash merge → natural postmerge main 20/20. No production deployment or changes to #620, #665 or unrelated owners. No accepted LOC until complete.
