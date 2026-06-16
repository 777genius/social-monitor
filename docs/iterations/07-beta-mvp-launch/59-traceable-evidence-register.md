# Iteration 07 - Traceable Evidence Register

## Evidence Goal
Prove that beta validated the MVP loop and produced actionable post-MVP decisions.

## Critical Audit Evidence
- Launch evidence bundle covers E2E, source certification, summary eval, security and restore.
- Known limitations are visible to users and support.
- Beta ring expansion decisions are go/hold/rework with evidence.
- Post-MVP backlog separates blockers, accepted gaps, evidence-based opportunities and deferred ideas.
- Capacity envelope, degradation behavior and ring expansion thresholds are visible in launch evidence.

## Decision Evidence
- Beta scope freeze.
- Supported source list.
- Launch/rollback gates.
- Feedback taxonomy.
- Post-MVP source expansion criteria.

## Ticket Evidence
- Onboarding tickets link to walkthrough results.
- Launch tickets link to checklist status.
- Feedback tickets link to classified examples.
- Roadmap tickets link to demand/risk/cost evidence.

## Review Evidence
- Cross-functional beta review is complete.
- Support owner confirms known limitations.
- Architecture owner reviews post-MVP backlog safety.

## Handoff Evidence
- Post-MVP owners accept prioritized backlog.
- ADR and quality-gate updates are linked.

## Executable Evidence Added
- `npm run check:mvp-core-loop` proves the backend MVP loop without network or paid provider access:
  topic creation -> source binding -> scan policy -> scan request queue -> ingestion execution -> feed projection -> summary request/execution -> digest assembly -> queued delivery attempt -> feedback classification -> `summary.ready` event -> realtime projection/replay.
- The same gate now proves launch pause safety for the core loop: source binding pause blocks new manual scan requests before quota reservation or queue enqueue, then resume allows the validated scan/feed/summary path to continue.
- The gate uses real use cases and ports across monitoring, ingestion, feed, summary and delivery. Only external source/model dependencies are deterministic adapters.
- Digest evidence in the same gate proves completed summaries and scanned feed items become digest provenance and a non-empty digest queues an in-app delivery attempt.
- Summary feedback now records category, triage owner, immutable summary/citation evidence and eval-fixture eligibility.
- The gate is now a blocking release evidence item in `ops/release/mvp-release-evidence-contract.json` and is included in `npm run verify`.
- `npm run check:hn-smoke` and `npm run check:rss-smoke` prove the two enabled real-source worker paths with deterministic clients: queue handler, provider registry, normalized source item persistence, feed projection, cursor commit and scan success reporting.
- `npm run check:beta-scope-policy` proves unsupported/deferred providers stay out of the beta binding catalog, binding attempts are rejected, and source demand is captured as `source_request` feedback routed to `source-owner`.
- `npm run check:beta-ring-policy` proves ring expansion thresholds link capacity, cost, source health and degradation evidence before inviting more users.
- `npm run check:beta-ring-decision` proves the current beta ring decision record is explicit go/hold/rework evidence: internal dogfood can continue, private-beta-1 expansion is held while feedback is fixture-only, blocker feedback exists, and target durable runtime evidence is not complete.
- `npm run check:beta-launch-support` proves the beta launch support REST API exposes scoped known limitations, supported/deferred source coverage and post-MVP backlog classification for users/support/operator clients.
- The same launch-support gate cross-checks supported/deferred source lists against `ops/ingestion/source-provider-certification.json`, preventing user-visible launch metadata from drifting from certified provider evidence.
- `npm run check:beta-feedback-report` proves beta feedback classification has a release artifact: sanitized feedback examples map to supported categories, deterministic triage owners, blocker/gap/opportunity/deferred classifications, eval-fixture eligibility, source-request no-binding behavior, backlog items and ring expansion impact.
- `npm run check:persistence-readiness` proves runtime in-memory/noop state adapters are not hidden: every API/worker module gap has owner, risk and durable replacement plan, and external beta remains blocked until durable adapters replace those gaps.
- `npm run check:monitoring-persistence` proves the first monitoring Prisma adapter foundation and runtime selectors: topics round-trip, source binding pause status persists through source catalog provider rehydration, scan policy `nextRunAt` is stored for durable scheduling, scan job status transitions persist across requested/enqueued/succeeded states, monitoring domain events append to the durable outbox as pending records, idempotency response payloads persist across adapter instances, `MONITORING_PERSISTENCE=prisma` is only valid with `DATABASE_URL`, and `MONITORING_SCAN_QUEUE=rabbitmq` is only valid with `RABBITMQ_URL`.
- Scan command transport now has broker-backed runtime paths on both sides: monitoring can publish through `AmqplibRabbitMqChannel`/`RabbitMqQueuePublisher`, and ingestion worker can drain commands through `RabbitMqScanCommandQueueReader` with ack/nack delivery semantics.
- Summary job transport now has broker-backed runtime paths on both sides: Summary REST can publish `summary.job.execute` through `RabbitMqQueuePublisher` with `SUMMARY_JOB_QUEUE_MODE=rabbitmq`, and intelligence worker can drain commands through `RabbitMqSummaryJobQueueReader` plus `SummaryJobQueueDrainLoop` with ack/nack delivery semantics. Repository polling remains a local fallback and is disabled by default when the RabbitMQ reader mode is selected.
- Platform event durability now has executable Prisma adapters: `PrismaOutboxStoreAdapter` dispatches pending outbox rows and marks published/failed states, while `PrismaInboxStoreAdapter` persists processed-event dedupe across adapter restarts. Full external beta still requires wiring those adapters into runtime relay/consumer processes and cross-process scheduler deployment evidence.
- `npm run check:ingestion-feed-persistence` proves the first ingestion/feed Prisma adapter foundation plus feed API, ingestion-worker and ingestion-support runtime selectors: provider-level source item dedupe, scan cursor roundtrip, feed canonical URL dedupe, feed search/list, feed item rehydration, durable scan retry/dead-letter persistence, durable scan attempt terminal-state persistence, scan lease fencing/release behavior, `FEED_PERSISTENCE=prisma` validation, `INGESTION_WORKER_PERSISTENCE=prisma` validation and `INGESTION_SUPPORT_PERSISTENCE=prisma` validation.
- `npm run check:summary-persistence` proves the first summary Prisma adapter foundation and summary runtime selector: summary job idempotency/status transitions, completed/no-signal artifact JSON payload rehydration, paginated artifact list/read behavior, feedback idempotency/evidence roundtrip, `summary.ready` event append to durable outbox as pending records, and `SUMMARY_PERSISTENCE=prisma` validation.
- `npm run check:identity-persistence` proves the first identity Prisma adapter foundation and identity runtime selector: API key create/list/verify/revoke, required scope enforcement, revoked-key rejection, no secret-hash exposure in key views, and `IDENTITY_PERSISTENCE=prisma` validation.
- `npm run check:usage-persistence` proves the first usage Prisma adapter foundation and usage runtime selector: public API audit event persistence with redacted metadata, rate-limit bucket counting, quota bucket reservation/rejection, and `USAGE_PERSISTENCE=prisma` validation.
- Ingestion worker scan execution reporting now has an explicit runtime selector: default `noop` remains valid for isolated deterministic worker smoke, while `INGESTION_SCAN_REPORTER=monitoring` is accepted only together with `MONITORING_PERSISTENCE=prisma`.

## Missing Evidence Blocks
- Real beta feedback classification report is not produced from user samples yet; deterministic pre-beta report exists at `ops/release/beta-feedback-classification-report.json` and must be replaced with redacted real samples before external ring expansion.
- Real beta ring expansion decision record is not produced from live user samples yet; deterministic hold record exists at `ops/release/beta-ring-expansion-decision-record.json` and must be replaced or updated after redacted beta feedback samples exist.
- Durable runtime persistence evidence is not complete yet; current runtime is approved only for single-process private MVP and deterministic smoke validation.

## PR 14 Beta Feedback Classification Report Evidence

- Implementation slice: `chore: add beta feedback classification gate`

Verified commands:

- `npm run check:beta-feedback-report`
- `npm run check:release`
- `npm run check:code-quality`
- `npm run check:secrets`
- `git diff --check`

Evidence notes:

- Added `ops/release/beta-feedback-classification-report.json` as a deterministic pre-beta release artifact for feedback triage.
- The report models blocker, accepted MVP gap, evidence-based opportunity and deferred idea classifications without storing raw provider payloads or PII.
- `source_request` feedback is explicitly routed to `source-owner`, excluded from summary eval fixtures and prevented from changing beta source binding state.
- The gate verifies owner routing stays aligned with the summary feedback domain taxonomy and that blocker feedback holds ring expansion until a regression fixture or runbook action exists.

## PR 13 Beta Launch Support API Evidence

- Implementation slice: `feat: expose beta launch support API`

Verified commands:

- `npm run check:beta-launch-support`
- `npm run update:openapi`
- `npm run check:openapi`
- `npm run check:release`
- `npm run build`
- `npm run check:architecture`
- `npm run check:code-quality`
- `npm run check:secrets`
- `git diff --check`

Evidence notes:

- Added a `launch` bounded context with domain snapshot types, a read-model port, static MVP adapter, `GetBetaLaunchSupportUseCase` and REST adapter.
- `GET /beta/launch-support`, `GET /beta/launch-support/known-limitations` and `GET /beta/launch-support/post-mvp-backlog` expose user/support-visible launch limitations and post-MVP backlog classifications.
- The endpoints require tenant/workspace headers through `requireTenantScope`, preserving the repo-wide REST scoping rule even for read-only launch metadata.
- The smoke proves unsupported/deferred source visibility matches source readiness profiles and the source certification artifact, and that backlog items keep architecture guardrails.
- The beta MVP release contract now includes `beta-launch-support` as a blocking gate, and `npm run verify` includes `check:beta-launch-support`.
