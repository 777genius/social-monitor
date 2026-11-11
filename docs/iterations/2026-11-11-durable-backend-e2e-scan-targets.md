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
3. **Regression & coordination** — Dedicated positive/negative tests exercise
   the helper and reject disabled, duplicate or substituted factory delegation.
   `check:architecture` invokes `scripts/lib/durable-backend-e2e-scan-targets.test.mjs`
   directly; the config test no longer imports it. #745 integration preserves the
   earlier gates without adding a second test owner.

## Acceptance / integrated source-line cap
After #745 merged, the branch incorporated its shared-file changes using a
non-force, two-parent CAS update. The durable runner's legacy cap was ratcheted
from 1998 to 1906 physical lines, retaining every unrelated cap and check.
Before merge, independently review the final exact HEAD and require native
Ready 20/20; after guarded merge require postmerge main 20/20.

Never deploy production, override SSH, force push, disable tests or touch #665.
All relocated original LOC remain provisional until accepted.
