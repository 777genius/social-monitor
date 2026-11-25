# Offline Telegram native admission delta

This directory prepares reviewed bytes only. It does not install, launch a
collector, open LOGIN, change database privileges, or establish approval.
`native-admission-patch-plan.ts` is a pure function with no filesystem access.
The invoking installer remains separately owned and must wait for the existing
batch to finish and prove native quiescence under the existing global lock.

The complete plan adds a narrow Telegram terminal-proof branch to the existing
history helper and a fixed router dispatch after its full prior-history checks.
It is preparation only: isolated tests, independent review, final image/source
binding and a proven quiescent native installation window remain required.

## Fixed release manifest

The only manifest path is
`/var/lib/platform/social-monitor/telegram-channel/release.json`. Its schema is
exactly the following object (replace illustrative image, commit/tree and the
two bootstrap-created IDs with actual reviewed identities):

```json
{
  "version": 1,
  "image": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "sourceCommit": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "sourceTree": "cccccccccccccccccccccccccccccccccccccccc",
  "channel": "hiaimediaen",
  "tenantId": "00000000-0000-7000-8000-000000006101",
  "workspaceId": "00000000-0000-7000-8000-000000006102",
  "interestId": "00000000-0000-7000-8000-000000006105",
  "sourceBindingId": "00000000-0000-7000-8000-000000006107",
  "scanPolicyId": "00000000-0000-7000-8000-000000006108"
}
```

The file must be root-owned, regular, mode0600, single-linked, bounded to16384
bytes and reached through root-owned directories without group/other write
permission or symlinks. Every path/descriptor identity is checked around the
read. Duplicate JSON fields, unknown fields and noncanonical identities fail.
Commit/tree fields are provenance declarations; the root installer must bind
them to the actual built image. Admission does not inspect Docker or the DB.
Bootstrap must prove the manifest binding/policy IDs belong to the fixed scope;
the runner independently checks those persisted objects. The wrapper archives
the exact manifest bytes as mode0600 `release.json` inside each attempt; both
native pre-LOGIN checks require that archive to equal the current secure manifest.

## Attempt and proof dictionaries

The existing native `attempt_binding` supplies the unchanged
`generation-role` dictionary: `{"role":"social_monitor_collection_v2","oid":N}`.
There is no new role, credential file or replacement database guard.

The exact state line is one ASCII line ending with LF:

```text
STARTED mode=telegram-channel date=YYYY-MM-DD artifact=telegram-hiaimediaen-YYYYMMDD-HH-UUID image=sha256:HEX before=N,N watchdog=social-posts-wd-UUID credential_deadline=YYYY-MM-DDTHH:MM:SSZ slot=HH release_sha256=HEX
```

`UUID` is the suffix of the native attempt ID `YYYYMMDDTHHMMSSZ-UUID`.
`HH` is the current UTC four-hour slot (`00`, `04`, `08`, `12`, `16`, `20`).
Both attempt timestamp and state date must be in the current date/slot. The
image must equal the release image and `release_sha256` is SHA256 of the exact
manifest bytes, including whitespace/newline. Fields cannot repeat or expand.

The native caller retains `deadline_epoch` and its finite30-minute ceiling,
watchdog checks, fd9 lock, current authority/role OID checks and SQL compare-and-set.
The existing `PREWRITE_BACKUP label=... stop=EPOCH day=YYYY-MM-DD slot=HH`
receipt is mandatory. The new branch passes date/slot to the unchanged
`prewrite_identity`, and the existing native validator/SQL rechecks its120-second
freshness. Both pre-LOGIN claim checks reread exact state and the secure manifest.
The existing native open result remains
`{"status":"CURRENT_ATTEMPT_OPENED","role":"social_monitor_collection_v2","oid":N}`.

The actual contained helper defines `now()` as a bounded `date -u +%s` call,
validated and returned as an integer. It also defines the used `public()` API.
The old watchdog does not parse attempt mode: it derives the exact container
name `social-posts-${attempt_id,,}` and closes the role by retained generation
OID. A Telegram wrapper must retain that container name. Existing
`check-unopened`/`clear-unopened` accept only `current-slot` and are unavailable
for Telegram; no cleanup may pretend that an ambiguous attempt never existed.

## Fixed read-only CLI and terminal contract

The installed Python module accepts only `release` (no arguments) and
`validate-terminal ATTEMPT_ID`. Both require root and the exact installed source
path. `release` returns `{"release":MANIFEST,"release_sha256":HEX}` after secure
fixed-path validation. It never returns credentials or chooses a caller path.

The wrapper retains `started-state` (the original STARTED bytes), archived
`release.json`, exact sanitized runner stdout in `result.json`, and
`generation-role`. Following independent native role closure and container
removal it publishes:

```text
COMPLETED_VALIDATED mode=telegram-channel date=YYYY-MM-DD artifact=ARTIFACT collector_exit=0 exit=0 before=N,N after=N,N slot=HH release_sha256=HEX
```

The mode0600 `terminal-proof` has exactly these keys:

```json
{"version":1,"attemptId":"ATTEMPT_ID","startedStateSha256":"HEX","stateSha256":"HEX","releaseSha256":"HEX","resultSha256":"HEX","completedAt":1792357210}
```

All hashes bind exact retained bytes. Completion must precede the retained
credential deadline, be within the attempt's UTC day/slot and not be future.
The deadline cannot exceed attempt start by30minutes; the wrapper refreshes its
attempt timestamp after preparation. The retained generation is exactly the
existing `social_monitor_collection_v2` OID463883. Normal result schema matches
the runner's collect output and validates fixed scope/binding/policy, bounded
counts and checkpoint summaries. Source-count delta equals `inserted`; feed
delta is between zero and `projected` because projection may update an existing
row. `complete` and honest `partial` outcomes are both operationally terminal;
the latter retains its incomplete/backfill flags and is never relabeled complete.
Zero-page partial success requires a previously pending range that closes at its
stored ceiling, clears pending, and retains a valid history gap covering its
prior watermark through its next-page boundary. Fetched, inserted, projected and
duplicate counts must all be zero, with unchanged global row counts. This admits
permanent unavailability of the first pending history page without accepting an
unproven empty scan.

A narrow `deferred` result additionally requires exactly `deferred:true` and
`failureStage:"provider_fetch"`, zero item/page/warning counts, unchanged global
counts, and identical before/after/inspection checkpoints (including initial
null). The pinned runner emits it only when fetch threw before returning any
items, the durable failure reporter completed successfully, ExecuteScan returned
its failed result, and the raw persisted cursor stayed identical. Post-fetch,
persistence, reporting or ambiguous failures stay fail-closed. They can block the
shared batch until an independently supported reconciliation; an exit code or
closed role alone never qualifies unknown effects.

`validate-terminal` derives every file path from its strict attempt ID and returns
only `TELEGRAM_TERMINAL_VALIDATED`. It never opens database authority. The pinned
history branch runs it twice around the existing independent `role_closed`,
`container_absent` and `watchdog_inactive` checks. Incomplete publication markers
or a fired watchdog refuse admission. Existing prior-mode history checks remain
byte-identical. Only incoming Telegram permits previously qualified days up to
today, since its fixed provider/channel target is disjoint from old batches;
hourly UUID-distinct Telegram attempts are not collapsed into a four-hour batch.

The finite Type=exec service uses the existing strict external-owner path: the
old auto-current service must be quiescent, its timer enabled/active/waiting and
the manager job list empty. An active auto-current owner still requires its exact
current-slot ancestry. No owner-chain checks are relaxed.

## Patch cascade and installation boundary

The plan requires exact before SHA256 values for six retained production sources.
It returns nine output files with exact before/after hashes and contents:

1. New Python module, sourced shell mode module and container entrypoint.
2. Three additive new-mode dispatches in `current_profile_admission.py`: validate,
   fresh prewrite and twice-called `open_claim`.
3. An early Telegram-only terminal branch in the full history-preclaim helper.
4. Fixed module loading/init and post-history dispatch in the existing router,
   plus its history hash and narrow incoming-Telegram date eligibility.
5. The exact previous router/fence pair in retained source lineage.
6. Only PINS metadata in `physical_operator_epoch.py`, including both shell files.
7. Only SOURCES metadata in the stage, including updated Python source hashes.

The fence, role guard, native evidence pin, existing source bindings and
all qualification checks remain unchanged. `current_admission_sources.sources`
accepts only the one additional exact previous pair, retaining all old cases.
The historical native evidence checks
unchanged shared source/slice identities; it does not certify Telegram effects.

No installation function is supplied by this planner because multiple replacements
cannot be atomic together. A separately reviewed installer must hold fd9,
recheck **all** before hashes/custody and new-file absence, stage/fsync every
output and retain byte-exact preimages before any replacement. Publish only
while no native invocation can enter. On failure restore **all** preimages,
remove only this installer-created new module, verify the whole old cascade,
and leave collection disabled if restoration is uncertain. Never run an
intermediate cascade or modify pins to accept unexpected input.

## Focused verification (not run by this worker)

From repository root, with retained snapshots copied to an isolated test host:

```sh
python3 ops/deploy/telegram-channel/test_current_telegram_channel_admission.py
TELEGRAM_NATIVE_SNAPSHOT_DIR=/absolute/read-only-snapshot npx ts-node ops/deploy/telegram-channel/native-admission-patch-plan.test.ts
npx tsc --noEmit --strict --target ES2023 --module commonjs --esModuleInterop --skipLibCheck ops/deploy/telegram-channel/native-admission-patch-plan.ts ops/deploy/telegram-channel/native-admission-patch-plan.test.ts
```

These tests validate fixed-scope rejection, state/manifest rereads, stale slots,
unsafe file metadata, duplicate fields, exact before SHA refusal, reproducible
hash cascading and byte preservation of all previous-mode behavior. They never
load the installed operator framework or invoke a provider/database.
