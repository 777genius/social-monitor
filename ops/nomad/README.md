# Nomad API vertical slice (MVP)

Status: implementation plan and reviewable code, exactly as scoped by
`docs/architecture-memory/nomad-deployment-migration-plan.md` ("Nomad
Vertical Slice MVP: deployment API Social Monitor"). **This document, and
everything under `ops/nomad/`, is not a production bootstrap or rollout
authorization.** No file here has been run against a real Nomad agent, a
real nginx process, or the production VPS. Every test in this directory
runs against in-memory fakes or temp-dir fixtures.

## What this MVP does

Manages only the `sm-api` service on a single-node Nomad CE (server+client)
on the existing VPS: a CI-built, digest-pinned GHCR image, one jobspec,
native health/readiness checks, and a canary rollout that only cuts nginx
traffic over once Nomad reports the candidate healthy. Caddy/nginx,
managed PostgreSQL, RabbitMQ, Redis, OTel, workers, agent-runtime, and the
existing schedulers are untouched and keep running exactly as they do
today. The existing Compose API remains the proven rollback target for as
long as ownership stays `compose` (the only value this MVP ever writes in
production - see "Ownership" below).

**Explicitly out of scope for this MVP** (plan sections 1 and 10): Consul,
Vault, Traefik, multi-node HA, autoscaling, a new registry, moving
workers/agent-runtime/schedulers onto Nomad, a new migration runner, schema
changes, or a new deployment framework/DSL. Those are separate, later
phases with their own plan sections - implementing this MVP does not imply
any of them are ready.

## What was implemented (PR1-PR4)

| PR | Files | What it proves |
| --- | --- | --- |
| PR1 | `api.Dockerfile`, `contracts.mjs`(+test), `preflight.sh`(+test), `.github/workflows/production-api-nomad.yml` | An immutable, digest-pinned API image builds and pushes to GHCR without touching production; the six narrow release/health/traffic contracts validate correctly. |
| PR2 | `ownership.mjs`(+test), `ownership-guard.sh`(+test), `api-env-entrypoint.mjs`(+test), `host/nomad.hcl`, `host/acl.hcl`, `versions.json`, `bootstrap.sh`(+test) | A durable `compose`/`nomad` owner marker exists and round-trips atomically; the API's env-file entrypoint parses safely without `eval`; the Nomad agent/ACL config and pinned version are reviewable; bootstrap is dry-run-only in this PR. |
| PR3 | `adapters/nomad.mjs`(+test), `adapters/nginx.mjs`, `release.mjs`, `reconcile-traffic.mjs`, `rollout.test.mjs`, `api.nomad.hcl`, `host/api-deploy.service`, `host/api-traffic.service`, `.github/workflows/production-api-nomad-deploy.yml` | The full canary sequence (candidate → healthy → nginx switch → promote, or revert/restore on any failure) works end-to-end against fakes, including untrusted-endpoint rejection and the first-deployment-has-no-previous-release case. |
| PR4 | `concurrent-release.test.mjs`, `failure-drill.test.sh`, this README | Concurrent/stale submissions, a fully offline Nomad backend, and recovery after a mid-release crash are all proven not to corrupt the route or the owner marker. |

## Running the tests locally

Everything below runs against fakes/temp directories; none of it needs a
real Nomad agent, nginx, or network access to production.

```sh
git diff --check
npm run check:source-line-cap
npm run check:architecture
npm run check:code-quality

node --test ops/nomad/*.test.mjs ops/nomad/adapters/*.test.mjs
bash ops/nomad/preflight.test.sh
bash ops/nomad/bootstrap.test.sh
bash ops/nomad/ownership-guard.test.sh
bash ops/nomad/failure-drill.test.sh
```

If the `nomad` CLI is available in your environment, also run
`nomad fmt -check ops/nomad/api.nomad.hcl` and
`nomad job validate ops/nomad/api.nomad.hcl` (with a var-file if your build
of the jobspec requires variables) - these were **not** run while writing
this MVP because `nomad` was not installed in that environment; the HCL was
checked manually for brace balance and against the Nomad job specification
docs only.

## Ownership: how `compose`/`nomad` actually works

`ops/nomad/ownership.mjs` owns a single durable marker file
(`<deployState>/nomad/api-owner`, default `compose` when absent - see
`resolveDeployStateRoot`). It is deliberately narrow (SRP): it only
reads/writes/validates the marker. It never decides whether switching is
safe, and nothing in this MVP's automated code paths ever calls
`writeApiOwner("nomad")` - `ops/nomad/failure-drill.test.sh` greps every
non-test `.mjs` file under `ops/nomad/` on every run to enforce that. The
switch to `nomad` is step 4 of the "Activation" checklist below: a human
runs it once, after everything else in that checklist is verified on the
real host.

## Honestly unresolved gaps (carried forward from PR2/PR3, not new)

These are not hidden - they are the reason this MVP cannot be pointed at
production today, even though every test above is green:

1. **The owner-aware guard does not exist yet in the real production
   controller.** `ops/deploy/social-monitor-production-deploy.sh` and
   `ops/deploy/postgres-runtime-deploy-lib.sh` are protected by this repo's
   cryptographic transition-review bridge
   (`ops/deploy/production-transition-review-lib.sh`, ssh-keygen signatures
   over `allowed_signers`, git-blob-hash assertions in
   `ops/deploy/rabbitmq-quorum-deploy-bridge-transition.test.sh`). Extending
   them to consult `ownership.mjs` before recreating/stopping the API
   requires a real human-signed review PR - it is not something generated
   code can or should do. Until that lands, the "dual-owner regression"
   this plan worries about is only closed on the `ops/nomad/` side, not on
   the legacy Compose side.
2. **The restricted SSH wrapper does not implement the `nomad-*` verbs**
   `.github/workflows/production-api-nomad-deploy.yml` calls
   (`nomad-plan`/`nomad-deploy`/`nomad-status`/`nomad-rollback`). That
   workflow is `workflow_dispatch`-only, gated behind an explicit
   `confirm_wrapper_extended` input, and refuses to run until that wrapper
   extension ships separately.
   `ops/deploy/social-monitor-production-ssh-wrapper.sh` is not covered by
   the same signature bridge as the two files above, but extending it is
   still a distinct, reviewable change this MVP does not make.
3. **`release.mjs --apply` is not implemented.** Only `runRelease()` is
   exercised, in-process, by `rollout.test.mjs` and
   `concurrent-release.test.mjs` with fake Nomad/nginx adapters. Wiring the
   CLI to a real Nomad agent and a real nginx reload is the separate,
   explicitly reviewed activation step referenced throughout this
   directory's source comments.
4. **`bootstrap.sh --apply` is not implemented** (dry-run only). Installing
   Nomad/ACL/systemd units on the real host is the reviewed admin bootstrap
   procedure in the Activation checklist, step 2 - not something this PR's
   code runs.
5. **The pinned Nomad release's GPG signature has not been verified** in
   `ops/nomad/versions.json`. Its SHA256 was compared byte-for-byte against
   the published SHASUMS file, but the `.sig` was not checked against
   HashiCorp's public key (72D7468F) because that key was not available in
   the environment this MVP was written in. Verify it before bootstrap.
6. **`nomad fmt`/`nomad job validate` were never run** against
   `api.nomad.hcl` (see "Running the tests locally" above) - the `nomad`
   CLI was not installed in this environment.
7. **No real VPS state was inspected.** Every "confirmed" fact in the plan
   comes from reading this repo's code (the production controller,
   Compose files, pool budget) on a specific commit SHA, not from querying
   the live host. The plan's own preflight (release evidence: host
   identity, image IDs, DB occupancy, current release markers) has to run
   on the real VPS before any of this touches it.

None of the above are things a future PR can silently work around by
editing a hash constant, a signature file, or an `allowed_signers` entry -
several are cryptographically enforced precisely so that they require a
real human review.

## Activation checklist (plan section 7) - for the human who runs this, not for CI

This is a checklist, not a permission slip. Nothing in this repository
runs any of these steps automatically.

1. **Preflight.** Collect the redacted release-evidence record (plan
   section 2: host identity, image IDs, DB occupancy, no unfinished
   deploy/rescue/hold in progress). Verify the candidate and fallback
   images are both actually pullable.
2. **Install.** Through a separately reviewed admin channel (not this
   repo's CI, not the restricted deploy account): install the pinned Nomad
   binary/systemd units/ACL/mTLS from `host/nomad.hcl` and `host/acl.hcl`,
   with the dormant nginx adapter in place. The existing Compose API keeps
   serving traffic throughout this step.
3. **First candidate.** Under the existing deploy/admission locks, start
   `sm-api` on Nomad. Verify native health checks, the exact image digest,
   DB/RAM surge headroom, and direct candidate reachability - all before
   any public traffic moves.
4. **Cut over.** Switch nginx to the approved, healthy Nomad endpoint.
   Verify both public origins and auth/session behavior. Only now commit
   the owner marker to `nomad` (`ops/nomad/ownership.mjs set-owner nomad`)
   and stop the old Compose API, keeping its image/config in place. Repeat
   one controlled update afterward to prove native canary from an already
   `nomad`-owned stable release, not just the from-Compose transition.
5. **Soak.** Run the existing required 300s restart/proxy/log/queue soak
   and record the release/route receipt before enabling routine automation.

Rollback at any point before step 4 completes: nothing to undo, Compose
was never stopped. Rollback after step 4: reverse the owner marker to
`compose` and restore the pinned Compose image/config (plan section 8) -
this is the `rollback-required` path this MVP's contracts and tests
already model, not a new mechanism to invent at rollback time.
