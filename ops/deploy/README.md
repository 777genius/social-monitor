# Production Autodeploy

Production deploys use GitHub Actions plus one forced, project-scoped SSH
command on the Social Monitor droplet. The workflow never receives an
interactive host shell.

## Component policy

- `apps/frontend/**` builds and uploads versioned public/admin web bundles.
- backend app, `libs`, Prisma and root build changes run backend verification
  and rebuild only the affected Compose services.
- shared backend or Prisma changes rebuild all Node services.
- `scripts/**`, `ops/evals/**` and `test/**` rebuild the daily runner only.
- `apps/x-collector/**` rebuilds only the X collector.
- deploy-control changes update the forced command without restarting the app.

The host compares the target commit with durable component markers. It does not
trust only the immediately previous GitHub push, so a delayed or retried run
cannot silently skip an earlier component change.

## Safety model

- only full commit SHAs already contained in `origin/main` are accepted;
- the deploy account is restricted by `sshd` `ForceCommand`, has no password,
  TTY or forwarding, and may sudo only the root-owned deploy entrypoint;
- production and daily work are serialized with separate `flock` locks;
- integration advances only by fast-forward from a clean worktree;
- backend deploys create and validate a managed PostgreSQL custom-format backup first;
- every live PostgreSQL base table must appear in the new dump TOC, while CI
  separately keeps the reviewed backup/restore contract aligned with Prisma;
- only the 10 newest verified `pre-autodeploy` dumps are retained; manual,
  incident, partial and unknown backup artifacts are never pruned automatically;
- previous container image IDs are retained and restored on runtime failure;
- frontend releases are immutable directories switched through symlinks;
- failed frontend health checks restore the previous symlink targets;
- database migrations are forward-only and are never automatically reversed.

## GitHub environment

The `production` environment owns:

- secret `PRODUCTION_SSH_PRIVATE_KEY`;
- secret `PRODUCTION_SSH_KNOWN_HOSTS`;
- variable `PRODUCTION_SSH_HOST`;
- variable `PRODUCTION_SSH_USER`.

Use a dedicated key. Never reuse an operator key or put production secrets in
the repository. Pin every third-party action to a full commit SHA.

## Host paths

- SSH wrapper: `/var/data/social-monitor/control/github-production-deploy-wrapper.sh`;
- root entrypoint: `/var/data/social-monitor/control/github-production-deploy.sh`;
- state: `/var/data/social-monitor/control/deploy-state`;
- upload staging: `/var/data/social-monitor/runtime/deploy-staging`;
- frontend releases: `/var/data/social-monitor/runtime/frontend-releases`;
- integration: `/var/data/social-monitor/integration`;
- backups: `/var/data/social-monitor/backups`.

The entrypoint is installed root-owned. After a successful control deployment,
it atomically refreshes itself from the reviewed copy in the integration repo.
The reviewed `host/` directory contains the exact `sshd` Match block and
sudoers rule. Installation must copy them to
`/etc/ssh/sshd_config.d/social-monitor-deploy.conf` and
`/etc/sudoers.d/social-monitor-deploy`, validate them with `sshd -t` and
`visudo -c`, then reload SSH.
