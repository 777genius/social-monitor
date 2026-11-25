# Consumed worktree janitor

`consumed-worktree-janitor.sh` is restricted to Social Monitor worktrees named by
the project consumed-output ledger. It defaults to a read-only dry-run. The
project `worktree-cleanup.lock` serializes dry-runs and applies with other
project worktree maintenance.

The janitor validates the complete item ledger before planning any mutation. It
requires ordinary candidates to be canonical direct children of
`/var/data/social-monitor/worktrees`, with Git
worktree registration, terminal consumption, a retained integration commit for
integrated records, immutable archive/status/patch evidence that still exactly
matches the worktree, and no live job, controller operation, integration,
bootstrap, tmux pane, or process. It does not enumerate arbitrary directories
and never writes worker registries or handoffs.
The dry-run unit intentionally retains host `/tmp` visibility because tmux
server sockets normally live there; process and tmux liveness must not be
hidden by a private temporary-filesystem namespace.
Process enumeration binds each PID to its `/proc/<pid>/stat` starttime before
and after reading resource links. It skips resource inspection only when
`/proc/<pid>/status` explicitly reports `Kthread: 1` or `State: Z`; a vanished
or reused PID is ignored, while other live unreadable evidence fails closed.

Dry-run also recognizes one fixed relocation layout. A ledger may declare a
logical direct child of `/var/data/social-monitor/worktrees` that is a
root-owned symlink to the same basename directly below
`/var/data/social-monitor/worktrees/.volume2/root-worktree-archive-20260727`.
The symlink is classified before ordinary canonical-path validation. The
janitor requires an absolute one-hop binding, real root-owned non-writable
parents and target, exactly one registry binding to the logical path, and
exactly one Git registration resolving to the archive target. Other symlinks,
archive roots, nested layouts, basename mismatches, broken targets and
ambiguous bindings fail closed.

Dry-run checks relocated Git state, terminal evidence and all activity against
the validated target, reports the logical and target paths, and snapshots
target apparent bytes and inode count. It reports the logical symlink as one
additional inode. Candidate records are sorted by logical path. The reported
schema-v2 relocation plan SHA-256 binds the current main commit, ledger and
evidence paths and hashes, logical and target identities, registry path and
hash, accounting snapshot, and the exact single unlocked Git registration.

Ordinary `--apply` remains relocation-excluding: it emits
`relocation-dry-run-only` and changes neither relocated path. Relocated removal
requires a separate, exact confirmation copied from a current dry-run:

```sh
/var/data/social-monitor/integration/ops/maintenance/consumed-worktree-janitor.sh \
  --apply-relocated --expected-plan-sha256 <reported-sha256>
```

The command reacquires the cleanup lock, recomputes the complete plan, and
fails before writing if the digest differs. If that digest already has a
durable schema-v2 receipt, replay is instead limited to that receipt-bound
batch; later main commits and unrelated ledger items neither invalidate its
recovery nor become authorized by it. Before every mutation it
revalidates main, ledger/evidence/registry hashes, path identities and
ownership, the exact unlocked registration, terminal state, job/controller/
tmux/process inactivity, and accounting. It writes and fsyncs a schema-v2
`prepared` receipt, unlinks only the exact logical symlink, revalidates, invokes
`git worktree remove --force` for the exact archive target, verifies the target
is absent and unregistered, then writes and fsyncs the `removed` receipt. It
does not edit Git metadata manually and does not run `git worktree prune`.

For every terminal ledger item, the worktree basename must equal `jobId`, the
archive basename must be `<jobId>-<status>-<attemptId>`, and the three evidence
files must be the archive's direct `git-status.txt`, `tracked.diff`, and
`tracked.numstat` children. The archived state is compared with `git status
--short`, `git diff --binary HEAD --`, and `git diff --numstat HEAD --` before
planning and immediately before removal.

The supplied service intentionally omits `--apply`, so installing or enabling
the timer only records a dry-run in the journal. Applying removals is a separate
operator decision:

```sh
/var/data/social-monitor/integration/ops/maintenance/consumed-worktree-janitor.sh --apply
```

The supplied unit also makes the complete Social Monitor project root
read-only, so an accidental `--apply` edit still cannot remove a worktree. To
make an installed timer apply, create a reviewed systemd drop-in that clears
`ExecStart` and `ReadOnlyPaths`, restores the exact command with `--apply`, and
grants only the control, integration Git metadata, and worktree write paths.
Removing that drop-in returns the service to safe dry-run behavior. Do not copy
the test-root environment gate into a service or production invocation.

Each successful ordinary removal atomically appends a legacy schema-v1 JSON receipt to
`/var/data/social-monitor/control/consumed-worktree-janitor.audit.jsonl`. The
receipt binds the ledger ID and item hash to the canonical worktree and records
the three archive-evidence hashes plus the apparent bytes before and after
removal. A matching receipt makes replay idempotent; a receipt that conflicts
with the ledger, its evidence, or an existing registration stops the run.
Schema-v1 replay remains supported. Schema-v2 replay accepts only the exact
prepared/removed states: before logical unlink, after logical unlink while the
target remains exactly registered, after verified Git removal, or fully
removed. Any mixed, reordered, duplicate, changed-identity, or receipt-conflict
state fails closed. A completed schema-v2 receipt is an absent-worktree
tombstone: it is counted as replayed before candidate planning and contributes
no dry-run candidate, byte, or inode totals.
