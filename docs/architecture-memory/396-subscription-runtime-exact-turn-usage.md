# Subscription Runtime Exact Turn Usage

## Decision

Social Monitor bills a Codex turn from the exact per-update usage snapshot,
never from the thread's cumulative counter. The pinned subscription-runtime
artifact moves from `0.1.0-main.30` to `0.1.0-main.41`, packed from upstream
commit `42ea1696` (`vioxen/subscription-runtime` PR `#165`).

`thread/tokenUsage/updated` carries two different numbers. `tokenUsage.total` is
the thread's cumulative counter and spans neighbouring turns, retries and attach
replay; `tokenUsage.last` is the usage of that one update. Up to `main.40` the
turn was derived from `.total`, so a freshly started thread was billed almost the
whole cumulative counter.

Two distinct P0 paths are involved, and only the first comes from PR `#165`:

- **P0-1, exact turn usage** - closed by `#165` (`42ea1696`).
- **P0-2, worker-root usage reaching CLI telemetry and the application parser** -
  closed earlier, somewhere in the `main.31..40` range. It is broken on the
  previously pinned `main.30` and already working on `main.40`.

Moving the pin from `main.30` to `main.41` is what closes both. Do not restate
this as "`#165` closes both".

## Production Invariants

1. A turn is billed the growth of `tokenUsage.total` across that turn, anchored
   at `total - last` on the turn's first update. One notification arrives per
   model response, so a turn that calls a tool is billed the sum of its exact
   snapshots - not only the final one, and never the cumulative counter itself.
2. A usage snapshot that is present but malformed - negative, fractional, beyond
   safe-integer range, or a total disagreeing with its own parts - fails the turn
   closed and poisons it. No later well-formed snapshot revives a poisoned turn,
   and there is no fallback to the cumulative counter.
3. "Field absent" and "field present but untrusted" stay distinct outcomes.
4. A turn the app-server already acknowledged through `turn/start` is never
   replayed through `codex exec`. The account pool rotates instead, and the run
   fails closed once attempts are exhausted. This extends invariant 3 of
   `395-subscription-runtime-rate-limit-capacity.md` and is the reason the
   Reader Promotion V2 control lane no longer degrades to an exec fallback.
5. The artifact version and SHA-256 stay pinned in repository provenance and are
   proved by an executable verifier, not by review prose.

## Evidence

- subscription-runtime release: `0.1.0-main.41` (upstream manifest at that commit
  still reads `0.1.0-main.40`; the vendor version is a local successor and both
  numbers are recorded in the provenance file);
- artifact SHA-256:
  `ca38e840b0d46c4693a3e0b1c9ca18669854aab1f7ee17f4c613e3749d36e445`;
- source archive SHA-256:
  `5f01f69e8b2bd0e8b0d9e76c24f8e6f34eb59a3e020284a2bdb9743f713611c8`;
- provenance verifier: `npm run vendor:subscription-runtime`;
- usage contract: `npm run check:subscription-runtime-usage-contract`, run in
  both the pull-request and production-deploy workflows;
- regression proof: the same contract suite passes on `main.41` with no skips,
  and fails on both previously vendored artifacts. On `main.40` four behavioural
  P0-1 tests fail - a turn whose exact usage was 5 tokens is billed 1500 - while
  the P0-2 telemetry test already passes there. On `main.30` the P0-2 test is the
  one that fails. Two of the fail-closed tests also pass on `main.30`, because an
  artifact with no exact-usage path at all reports no usage; the P0-1
  discrimination rests on the two growth tests, not on those.

## Downstream Note

`main.41` can also emit `codex_app_server_turn_usage_{estimated,incomplete,`
`counter_rewritten,occupancy,untrusted}` warnings, and it classifies a
zero-parts snapshot - what Codex emits on context-window exhaustion and after
mid-turn auto-compaction - as context occupancy that bills nothing. Nothing in
this repository asserts on exact runtime `warnings` arrays today; if that
changes, those codes must be accounted for.

## Superseded Pin

`395-subscription-runtime-rate-limit-capacity.md` records the `0.1.0-main.30`
pin. `main.30` stays vendored because the Reader Promotion V2 canary lane
contract test pins that release deliberately; it is no longer the installed
runtime.
