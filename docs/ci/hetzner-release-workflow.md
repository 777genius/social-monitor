# Hetzner release workflow draft

This draft adds bounded candidate observation, host preflight and API activation
through the existing release client. It targets only `production-hetzner`.
It does not install or provision the controller, execute candidate SQL, or enable
automatic release. Technical review does not publish this workflow.

## Modes and dispatch

An unset or unknown `HETZNER_RELEASE_MODE` produces `disabled-skipped` before
event, GitHub or host access. `preflight` allows observation only. `manual` allows
an explicit owner dispatch to activate; completed CI events still use preflight.
Only configured `auto` selects activation from completed CI events.

Manual dispatch requires actor `777genius`, repository `777genius/social-monitor`
and `refs/heads/main`. Supply the exact successful main push `ci_run_id` and
choose `preflight` or `activate`. `rollback-previous` deliberately fails with
`rollback-unsupported`, including when a valid full `rollback_sha` is supplied:
a bounded rollback runner is outside this draft. Do not replay activation as recovery.

## Authority and data

Each job observes current main before checkout and compares the checked-out SHA
before executing repository scripts. GitHub observations require the exact active
CI workflow, successful main push run and attempt, all sixteen successful jobs,
matching repository identities, and the manually disabled legacy workflow.
Pagination must be complete; closing observations reject races. Stable stale
main produces `stale-main-skipped`. Host gates compare candidate outputs, and
receive/admit/activate reobserve authority before transport.

Only host jobs qualified by candidate phase `ready` and their exact lane enter
the shared `social-monitor-hetzner-production` concurrency group, with
`cancel-in-progress: false`. There is no workflow-level concurrency group, and
candidate jobs cannot occupy or replace a pending production job. GitHub allows
one running and one pending job per group; a newer qualified job replaces the
pending job even with cancellation disabled. Qualified newer same-SHA/main events
may therefore supersede pending events. Closing authority observations still
reject stale SHAs before host writes.

The unique artifact binds name, run, SHA, repository IDs, digest, size and expiry.
Its ZIP contains exactly `candidate.tar`, `candidate.tar.sha256`, `manifest.json`,
`phases.json`, `image-id.txt` and `source-sha.txt`; producer `build-image.txt` is
excluded. The tar stays opaque data. Manifest, qualified phase and sidecar
bindings must agree. Private scratch/config/key files are removed; only finite
receipt/phase artifacts remain, retained for 90 days.

Activation is sent once. An uncertain response triggers read-only status,
preflight and exact receipt reconciliation through the unchanged client.
Unproven reconciliation fails and requires operator review; there is no write retry.

## Static verification and remaining qualification

After Node 22 and locked dependencies are installed, `static_quality` runs the
standalone strict NodeNext typecheck once and each authority, observer and YAML
contract test once. Its first checkout and root controller gate retain their
original order. The existing `check:review-ci` also invokes the canonical parsed
release workflow guard through a bounded Node child process; importing its
JavaScript module does not load TypeScript. Malformed YAML, duplicate mapping
keys, literal merge keys and policy mutations fail with finite diagnostics.

Run the same bounded checks locally with existing dependencies:

```sh
npm run check:hetzner-release-typecheck
npm run check:hetzner-release-tests
npm run check:hetzner-release-contract
npm run check:review-ci
```

The required production_runtime job now builds and exports the exact candidate
once, verifies its native archive, and qualifies the actual API against a fresh
PostgreSQL 18 database and full migration history. The observer requires its
version 2 runtime proof. Native delivery, backup, reconciliation, rollback and
failed rollback latch have been qualified in disposable fixtures; their GitHub
authority/systemctl are modeled and their baseline is synthetic same-source.

The sixteen CI names remain unchanged. Production stays disabled until the
separate first-release preparation is approved and qualified: actual deployed
compatibility, missing migration, resolved historical migration evidence,
independent observer/backup closure and fixed controller installation. A resolved
rolled-back Prisma attempt with a later successful row is preserved audit history;
the current conservative adapter still denies it. Do not delete or rewrite that
history to pass admission, or treat disposable runtime proof as production parity.
No mode, secret or environment is enabled by these checks.
