# Source-live provider evidence boundary — 2026-11-11

## Scope and original-line ledger
Current main baseline c2ea8b7b8b33786b1ce5580c59a3bd5d29fac54b.
Move exactly three original cohesive validation functions from
scripts/check-source-live-certification-evidence.mjs into
scripts/lib/source-live-provider-evidence-validation.mjs:
validateLiveProviderEvidence, validateProviderEvidenceFields, validateProviderSignals.
98 unique original nonblank implementation LOC (111 physical lines including separator), not net-deleted LOC.
Original bodies copied verbatim after reversing two spaces of factory indentation.
Checker 1079 physical lines becomes 980; remove only this checker's obsolete 1078-line legacy exemption.
No change to source-live certification or staging evidence inputs, runtime IO, auth, production deploy, SSH,
fail-closed rules, source models, or CLI order. No overlap with independent model #665 or Trending #740 implementation.

## Architecture and 3 critique rounds
1. **SRP/SOLID:** CLI still owns loading evidence, ordering, exiting, logging; one narrow module validates
   live provider records, fields and signals with injected original dependencies. No stateful singleton or new storage.
2. **Behavior/security:** preserve exact error messages and validation order; pending/null guards,
   duplicate and missing providers, fake-source ban, immutable digest/commit, passed artifact
   delegation and external-beta readiness remain fail-closed.
3. **Regression/coordination:** deterministic positive/negative tests run via the *existing*
   source-live evidence-shape suite already wired to npm; TypeScript AST structural guard
   rejects missing/commented/dead/duplicated delegation. No new package.json entry.
   Source cap ratchet touches shared scripts/check-source-line-cap.mjs: reconcile with
   separately owned #740 on the latest main before Ready or merge, never clobber its cap removal.

## Acceptance
Draft Static/Security/Flutter and nonpublishing API image on exact HEAD; independent review;
Ready original 20/20 native E2E; SHA-guarded merge; postmerge main native 20/20.
All 98 original LOC are provisional until final acceptance; never count test or net diff lines.
