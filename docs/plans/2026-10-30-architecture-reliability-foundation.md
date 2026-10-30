# Reliability and architecture foundation — 2026-10-30

## Purpose and baseline

Strengthen the existing modular monolith before further feature growth. The aim is
to fix verified failure paths and make their ownership explicit; folder renames,
new DI frameworks, microservices and generic repository frameworks are not part of
this work.

Audit baseline: `d25dfaf3acec422de50dc2861f781444b2e37ffa` on `main`.
Researchers and independent critics use GPT-6.1sol with xhigh reasoning.

Existing work is kept separate: PR #587 owns the gateway LLM transport, #391 owns
the Nomad vertical slice, and #129 owns Flutter find-in-page.

## Verified starting findings

| Priority | Finding | Evidence / consequence |
| --- | --- | --- |
| P1 | Scan attempt failure prematurely terminates the monitoring job | `ExecuteScanUseCase` reports failure before scheduling a retry; the real monitoring aggregate then rejects the successful retry with “Only enqueued scan jobs can complete”. Reproduced with the real in-memory integration. |
| P1 | Delivery dispatch races with enqueue persistence | Enqueue publishes before saving its transitioned aggregate. An immediate consumer can send, then the stale producer snapshot overwrites the final delivery state. |
| P1 | Delivery execution has no atomic ownership | Concurrent workers load the same queued attempt and both send. A thrown provider call leaves `sending` outside the scheduler's recovery set. |
| P1 | Webhook HTTP egress is not guarded at the connection boundary | Default redirect following can forward signed payloads to a different/internal destination; DNS results are not vetted and response bodies are unbounded. |
| P1 | Draining durable scan retries deletes work before processing | Retry rows are deleted at drain time; synthetic delivery ack/nack are no-ops. Shutdown or concurrent drains can lose or duplicate work. |
| P2 | Scan-history pagination loses one record per page | Both repositories emit the first omitted row as cursor, then skip that row on the next request. Five rows with a limit of two return only four rows. |
| P2 | Queue timer failures can escape the runtime boundary | Queue drain or settlement rejection escapes fire-and-forget interval callbacks. |
| P2 | Architecture gates miss real forbidden imports | Disposable fixtures demonstrate same-context domain-to-adapter imports, adapter barrels and some alias cycles pass the current gate. |

Research candidates requiring a separate decision: event-outbox recovery/leases,
monitoring write-idempotency atomicity, and broker delivery settlement after
reconnection. They must be reproduced and scoped before implementation.

## Invariants and ownership

1. A scan attempt and a monitoring job have different lifecycles. Transient
   attempt failure must not make a scheduled retry unable to finish the job.
   Successful persistence must never be rewritten as provider failure merely
   because outcome reporting failed.
2. Work remains durable until acknowledged. Failure, shutdown and concurrent
   consumers must preserve retryability; only the current owner may settle work.
3. Delivery state transitions and dispatch must not overwrite a consumer's newer
   state. Ownership belongs in the repository contract and its atomic adapter,
   not in process-local locks or the queue handler.
4. Outbound URL validation remains a domain-safe policy. DNS resolution,
   connection pinning, redirects, deadlines and response bounds belong in an
   infrastructure transport. No webhook secrets or payloads enter logs.
5. Import rules judge resolved paths and actual dependency direction. Tests must
   demonstrate forbidden paths fail as well as legitimate composition passing.

## Planned workstreams

### A. Scan lifecycle and retry handoff

- [ ] Correct transient versus terminal outcome reporting.
- [ ] Make terminal outcome reporting safe on redelivery.
- [ ] Preserve successful ingestion state when downstream reporting fails.
- [ ] Replace destructive retry drain with an explicit acknowledged/leased
      delivery or atomic handoff, after reviewing the smallest compatible design.
- [ ] Fix cursor semantics in both scan-job repositories.
- [ ] Add integrated failure→retry→success, redelivery, page traversal,
      concurrent drain and shutdown regression tests.

### B. Delivery concurrency and recovery

- [ ] Document and implement the narrow atomic repository operations needed for
      dispatch and send ownership; do not widen the existing generic save method.
- [ ] Ensure dispatch cannot publish work and subsequently overwrite newer state.
- [ ] Fence concurrent senders and stale completion.
- [ ] Recover provider exceptions and expired ownership with explicit
      at-least-once semantics. Do not promise exactly-once external delivery.
- [ ] Keep in-memory and Prisma contracts equivalent, including tenant/workspace
      scope; review additive migrations if required.
- [ ] Prove immediate-consumer, simultaneous-sender, thrown-provider, stale-owner
      and replay behavior.

### C. Egress and runtime safety

- [ ] Close shared URL-policy gaps with focused address-range tests.
- [ ] Guard webhook connection targets, redirects, total deadline and response
      size through a reusable infrastructure boundary.
- [ ] Preserve injected transport testability and webhook signing behavior.
- [ ] Contain queue-drain/settlement failures at runtime tick boundaries, retaining
      useful diagnostics and future ticks.
- [ ] Validate channel-generation settlement if the suspected reconnect issue is
      confirmed.

### D. Executable architectural boundaries

- [ ] Resolve import targets before applying domain/application/adapter rules.
- [ ] Cover all configured bounded-context aliases in dependency-cycle checks.
- [ ] Add negative fixture tests for the demonstrated bypasses without weakening
      existing checks.
- [ ] Run the strengthened gate against the whole repository and fix genuine
      violations in scope; explain any additional work instead of adding blanket
      exclusions.

## Review and verification

Each workstream receives a focused regression test and an independent critique.
Before implementation of a complex storage or transport change, record the
chosen contract and its failure semantics below. Push finished commits as they
become available; keep this PR in draft while work or material checks remain.

Required common gates: TypeScript compilation, architecture, code quality, source
line caps, changed-file lint and `git diff --check`. Run relevant integration/E2E
and repository/queue checks, plus runtime-profile, security/dependency or public
contract gates when the changed surface requires them. Database concurrency
claims require a real isolated PostgreSQL check if the environment can provide
it; mocks alone are not database evidence.

No production deployment, provider calls, messages to real recipients or real
user project smoke flows are needed. This request authorizes draft PRs and code
pushes; it does not request merging or deployment.

## Decisions, evidence and remaining risks

Implementation decisions, exact commands/results and review corrections will be
recorded here as each slice completes. A green unit suite is not evidence of live
provider readiness, production migration safety or system-wide exactly-once
processing.
