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

Relocated candidates are planning evidence only. Dry-run checks Git state,
terminal evidence and all activity against the validated target, reports the
logical and target paths, and snapshots target apparent bytes and target inode
count. It reports the logical symlink as one additional inode separately so
target and combined totals remain auditable. Candidate lines are sorted by
logical path. `--apply` emits `relocation-dry-run-only` and removes neither the
logical symlink nor the archive target.

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

Each successful removal atomically appends a JSON receipt to
`/var/data/social-monitor/control/consumed-worktree-janitor.audit.jsonl`. The
receipt binds the ledger ID and item hash to the canonical worktree and records
the three archive-evidence hashes plus the apparent bytes before and after
removal. A matching receipt makes replay idempotent; a receipt that conflicts
with the ledger, its evidence, or an existing registration stops the run.
