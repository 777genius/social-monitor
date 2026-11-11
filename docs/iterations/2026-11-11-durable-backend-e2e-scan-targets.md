# Durable backend E2E scan-target policy extraction — 2026-11-11

## Scope and source evidence
Pinned original `main` 23b1c580bdae4bd134abb5c3b49014e98da5fd66. Move exactly **78 nonblank original function lines**
from `scripts/capture-durable-backend-e2e-loop.ts`: the five-provider scan target
selection, scheduled RSS target and Reddit app-only credential guard. Move the existing
10 nonblank type lines together with their ownership (88 total original nonblank lines,
not net deletion). Original function bodies are unchanged except the factory indentation.
Original executable CLI and its operator gate remain the only invoker.

## Architecture / independent critique
1. **SRP** — Scan target shape, credentials and user-agent defaults belong to one isolated
   policy. HTTP, SQL, network calls, tenant admission, process exit and orchestration
   stay in the original CLI. Do not create another store or an overlapping owner.
2. **Behavior & security** — Factory receives the same original `process` object plus
   existing `emptyToUndefined`; no frozen env snapshot, no network side effects.
   Exact provider ordering, authenticated Reddit requirement, raw Reddit nullish
   user-agent precedence, trimmed GitHub token behavior and two RSS URLs retained.
3. **Regression & coordination** — Seven focused positive/negative tests exercise the
   real helper under the already bounded architecture gate. Existing `config.test.mjs`
   imports the focused test solely to reuse the current explicit CI test launcher
   without modifying the shared `package.json`, which #745 currently owns.

## Acceptance / deferred shared-file ratchet
Initial branch touches only the loop, one new helper and its tests, this plan and
the existing durable E2E config test entrypoint. #745 exclusively owns the shared
`package.json` and `scripts/check-source-line-cap.mjs` while its Ready E2E runs.
Once #745 is merged or its owner releases, lower the loop's legacy line-cap entry
from 1998 to the actual extracted size on a fresh, CAS-checked main, keeping all
other cap entries. If useful, explicitly add the dedicated test to the npm suite
then remove the test-file import in the **same** change. Do not merge this PR until
the cap ratchet, reviewed exact-head native 20/20 and postmerge 20/20 all pass.

Never deploy production, override SSH, force push, disable tests or touch #665.
All relocated original LOC remain provisional until accepted.
