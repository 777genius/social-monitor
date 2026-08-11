# Consumed worktree janitor

`consumed-worktree-janitor.sh` is restricted to Social Monitor worktrees named by
the project consumed-output ledger. It defaults to a read-only dry-run. The
project `worktree-cleanup.lock` serializes dry-runs and applies with other
project worktree maintenance.

The janitor validates the complete item ledger before planning any mutation. It
requires canonical direct children of `/var/data/social-monitor/worktrees`, Git
worktree registration, terminal consumption, a retained integration commit for
integrated records, immutable archive/status/patch evidence that still exactly
matches the worktree, and no live job, controller operation, integration,
bootstrap, tmux pane, or process. It does not enumerate arbitrary directories
and never writes worker registries or handoffs.
The dry-run unit intentionally retains host `/tmp` visibility because tmux
server sockets normally live there; process and tmux liveness must not be
hidden by a private temporary-filesystem namespace.

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
