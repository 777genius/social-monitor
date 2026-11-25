# X source launch hold: staged contract and rollback

This patch is disabled preparation only. It does not install files, change a
service, call X, or activate a release. The current source has been stopped;
do not infer that database snapshots are safe merely from this admission gate.

## Stage before any activation

The reviewed runtime release must contain `x-launch-guard.py`,
`compose.x-launch-guard.yml`, and both Docker wrappers. The X image build
copies the guard; the Compose overlay also mounts the reviewed runtime guard
so a recreated legacy image still checks state on Docker restart. Verify the
rendered X service has both read-only mounts, the exact entrypoint and command,
and `restart: "no"`. Recreate the X container before relying on the contract;
an already-created container retains its old Docker configuration.

On a **separately authorized** host staging procedure, create the existing
root-owned `control/deploy-state` directory with mode 0755, then run the
installed guard's `init` once. It creates a root-owned 0644 lock and a durable
`phase=held` state. A missing lock, state, or installed guard refuses launch.
There is no automatic allow transition. An explicit `allow` is a separate
operator decision after source and snapshot readiness have been verified.

`hold` takes the same lock used by managed Compose, containerd, daily and
rolling admissions. It commits held state before stopping the exact managed
Docker X container and containerd fallback task; it returns failure if owner
inventory or stopping fails, while leaving the held state in place. Keep the
state held and investigate any failed stop. Docker restart of a recreated
container enters the guard again; `restart: "no"` removes automatic retry.

## Rollback

Keep the hold state and the guard-bearing Compose overlay during rollback.
Refuse a destination rollback while its X owner remains active; stop and
inventory that owner under the hold before restoring a destination image or
runtime control. Recreate only through the guarded Compose wrapper, and verify
the resulting container entrypoint, mounts and restart policy. Do not delete
the lock or state to make rollback pass. Do not restore a runtime release that
lacks the guard files while X is allowed. If rollback cannot preserve the
guarded configuration, leave X held and report the incomplete rollback.

Manual root `docker`, `ctr`, or direct provider commands outside these managed
entrypoints remain outside this contract. This is source launch admission,
not a universal database writer fence or a snapshot consistency proof.
