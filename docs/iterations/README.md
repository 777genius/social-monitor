# Iteration Roadmap - Powerful MVP

## Goal

Build a powerful MVP for a multi-tenant social intelligence platform:

```text
tenants -> topics -> source bindings -> scan policies -> normalized feed
-> dedupe/clustering -> AI summaries -> realtime/API status -> API/operator beta
```

The MVP must be production-shaped even if not enterprise-scale yet:

- DDD bounded contexts
- Clean Architecture
- SOLID
- ports/adapters
- NestJS monorepo
- event-driven workflows
- controlled microservice boundaries
- frontend-deferred API-first delivery
- future Flutter feature-scoped Clean Architecture / Feature-Sliced Design
- future MobX presentation stores
- generated REST clients
- WebSocket status updates
- source acquisition through official/open/provider adapters

## Frontend Deferral

The current MVP can be built without Flutter. The first delivery target is backend/API-first:

1. REST/OpenAPI contracts are stable and generated.
2. Backend loop works through OpenAPI UI, Postman/Insomnia, generated client or a small internal operator script.
3. WebSocket/realtime status can be tested through contract fixtures and client harnesses.
4. Support/operator diagnostics are available without a full user app.
5. Flutter remains the preferred later mobile frontend, but it does not block backend MVP completion.

Flutter is not the only possible frontend. Later options include Flutter mobile, Flutter web, React/Next.js web dashboard, an internal admin UI or a bot-style interface. The backend contract stays REST/OpenAPI + WebSocket so the frontend choice remains replaceable.

## Iterations

1. `00-foundation` - decisions, repo standards, contracts and domain map.
2. `01-platform-skeleton` - NestJS monorepo, services, local infra and contracts.
3. `02-ingestion-connectors` - HN/RSS first, connector SDK, scheduler, normalized feed.
4. `03-ai-summary-intelligence` - summary pipeline, structured outputs, evals and budget controls.
5. `04-mobile-app` - deferred Flutter/FSD track for later user-facing app.
6. `05-realtime-delivery` - WebSocket, notifications, digests and delivery semantics.
7. `06-production-hardening` - security, observability, CI/CD, SRE and compliance foundations.
8. `07-beta-mvp-launch` - beta readiness, onboarding, support, migration and launch gates.

See also:

- `09-cross-iteration-dependency-map.md` - critical path, parallel work lanes, stop gates and dependency rules across all iterations.
- `10-execution-master-plan.md` - sprint-by-sprint execution plan with deliverables, roles, quality gates and release controls.

## Folder Rule

Every iteration folder contains:

- `00-iteration-overview.md` - deep execution plan, gates, risks and sequencing.
- `01-*.md` to `04-*.md` - concrete phase files.
- `05-detailed-execution-plan.md` - phase-by-phase implementation checklist with deeper steps and edge cases.
- `06-phase-step-matrix.md` - compact per-phase execution matrix with dependencies, edge cases and validation gates.
- `07-implementation-backlog.md` - executable backlog grouped by backend, frontend, contracts, infra, tests and operational readiness.
- `08-ticket-breakdown.md` - ticket-ready execution units with artifacts, dependencies, acceptance checks and implementation risks.
- `09-quality-gates-risk-register.md` - hard quality gates, risk register, mitigations and transition criteria for the iteration.
- `10-build-order-checklist.md` - exact build order inside the iteration from contracts/domain to adapters, tests, observability and closure.
- `11-acceptance-test-plan.md` - acceptance, integration, negative and regression test scenarios that prove the iteration is complete.
- `12-operational-runbook.md` - practical execution runbook for daily workflow, review cadence, blockers, handoff and support/ops impact.
- `13-definition-of-done.md` - final completion checklist for code, contracts, architecture, tests, docs, ops and edge cases.
- `14-traceability-matrix.md` - mapping from goals to phases, tickets, contracts, events, tests, risks and definition-of-done evidence.
- `15-change-control.md` - rules for changing scope, contracts, events, source adapters, architecture decisions and rollout plans.
- `16-estimation-and-resourcing.md` - relative effort, required roles, parallel work lanes, bottlenecks and no-cut quality areas.
- `17-review-checklists.md` - PR and architecture review checklist for code, contracts, tests, events, source adapters, Flutter boundaries and ops.
- `18-decision-log.md` - iteration-level architecture/product decision log with alternatives, rationale, consequences and revisit triggers.
- `19-role-based-execution-plan.md` - role-by-role execution plan with ownership, handoffs, collaboration points and escalation triggers.
- `20-iteration-execution-index.md` - per-iteration navigation index that explains reading order and which files to use for planning, build, review and closure.
- `21-phase-to-ticket-map.md` - direct mapping from phase files to ticket groups, artifacts, contracts and closure evidence.
- `22-edge-case-playbook.md` - edge-case scenarios, early warning signals, validation method and mitigation path for the iteration.
- `23-deliverables-checklist.md` - concrete deliverables that must exist after the iteration: docs, contracts, code modules, tests, ops notes and closure evidence.
- `24-day-by-day-sequence.md` - practical day-by-day execution sequence with daily goals, parallel work, checks and stop conditions.
- `25-risk-based-priority.md` - risk-first priority order for the iteration, showing what must be done early because it can invalidate later work.
- `26-mvp-scope-guardrails.md` - scope guardrails that define what belongs in the MVP iteration, what is deferred and how to detect scope creep.
- `27-open-questions-and-assumptions.md` - explicit open questions, working assumptions, validation owner and decision deadline for the iteration.
- `28-implementation-readiness-scorecard.md` - readiness scorecard for architecture, contracts, tests, risks, staffing, ops, scope and blockers before execution starts.
- `29-quality-metrics-and-kpis.md` - measurable quality signals and KPIs that prove the iteration improved the MVP instead of just adding artifacts.
- `30-executive-brief.md` - concise executive summary for fast iteration review: goal, main risk, required outputs, stop gate and next transition.
- `31-ticket-template-pack.md` - ready-to-use ticket templates for domain, contracts, adapters, tests, mobile, ops and release work.
- `32-handoff-package.md` - transition package for the next iteration: delivered artifacts, contracts, open risks, owners, limitations and validation evidence.
- `33-implementation-start-checklist.md` - final pre-start checklist for prerequisites, locked decisions, first tickets, blockers and explicit no-go items.
- `34-engineering-kickoff-agenda.md` - kickoff agenda for aligning owners, contracts, risks, stop gates, first-day work and unresolved decisions.
- `35-first-sprint-ticket-cut.md` - first sprint ticket cut with ticket order, acceptance checks, dependencies, edge cases and no-go criteria.
- `36-sprint-review-demo-script.md` - sprint review/demo script with evidence, scenarios, edge-case checks, decision points and transition questions.
- `37-retrospective-improvement-log.md` - retrospective log for lessons, defects, process fixes, architecture debt, follow-up owners and next-iteration carryovers.
- `38-architecture-compliance-audit.md` - architecture compliance audit for Clean Architecture, DDD, SOLID, ports/adapters, events, NestJS and Flutter boundaries.
- `39-contract-dependency-checklist.md` - contract dependency checklist for inputs, outputs, owners, breaking-change risks and transition readiness.
- `40-implementation-risk-triage.md` - implementation risk triage with severity, early warning signals, owners, mitigations and stop-work triggers.
- `41-test-fixtures-and-scenarios.md` - test fixture and scenario plan covering happy paths, negative paths, contract cases, edge cases and regression seeds.
- `42-release-gate-and-promotion.md` - release/promotion gate plan with required evidence, blockers, rollback options, hold rules and transition approval.
- `43-production-readiness-gap-analysis.md` - production-readiness gap analysis separating MVP-acceptable gaps, blockers, owners and hardening follow-ups.
- `44-developer-execution-playbook.md` - developer execution playbook with reading order, PR slicing, checks, escalation rules and architecture guardrails.
- `45-definition-of-ready-for-tickets.md` - definition of ready for implementation tickets with required context, dependencies, edge cases, tests and acceptance checks.
- `46-qa-acceptance-signoff.md` - QA acceptance signoff with scenarios, negative cases, regression coverage, contract checks, residual risks and approvers.
- `47-implementation-command-checklist.md` - implementation command checklist with required local, CI, contract, security and evidence checks before review/merge.
- `48-operational-handoff-checklist.md` - operational handoff checklist with owners, runbooks, known issues, dashboards, rollback notes and support impact.
- `49-scope-change-decision-tree.md` - scope-change decision tree for accepting, deferring, blocking or escalating new requests during the iteration.
- `50-iteration-closeout-summary.md` - final closeout summary with outputs, gates, blockers, carryover and next-step readiness.
- `51-pr-review-rubric.md` - PR review rubric for architecture, contracts, tests, edge cases, observability, support impact and merge blockers.
- `52-architecture-decision-record-seeds.md` - ADR seed list for key decisions, alternatives, consequences, owners and revisit triggers.
- `53-team-ownership-and-communication.md` - team ownership and communication plan with decision owners, reviewers, sync points, escalation and handoff messages.
- `54-mvp-value-validation-checklist.md` - MVP value validation checklist tying outputs to user value, reliability, trust, extensibility and beta readiness.
- `55-anti-patterns-and-forbidden-shortcuts.md` - anti-pattern and forbidden-shortcut list that prevents prototype drift, contract drift and unsafe MVP shortcuts.
- `56-cross-functional-review-board.md` - cross-functional review board checklist for product, architecture, backend, mobile, QA, security, ops and support approval.
- `57-backlog-prioritization-matrix.md` - backlog prioritization matrix using risk, value, dependencies, architecture impact, testability and beta readiness.
- `58-risk-burndown-and-control-points.md` - risk burndown plan with early control points, evidence, escalation thresholds and end-of-iteration residual risk rules.
- `59-traceable-evidence-register.md` - traceable evidence register mapping decisions, tickets, tests, commands, reviews and handoff artifacts to proof.
- `60-final-go-no-go-checklist.md` - final go/no-go checklist with mandatory conditions, hard blockers, accepted exceptions and go/hold/rework decision.
- `61-sprint-zero-bootstrap.md` - sprint-zero bootstrap checklist for setup, owners, first artifacts, preflight checks and start blockers.
- `62-execution-calendar-and-cadence.md` - execution cadence calendar with kickoff, midpoint, review, closeout, sync points and stop conditions.
- `63-master-implementation-sequence.md` - master implementation sequence that orders reading, ticketing, execution, review, evidence and closeout.
- `64-iteration-acceptance-contract.md` - acceptance contract between iterations defining handoff promises, receiver expectations, blockers and allowed exceptions.

## How To Read An Iteration Folder

Use `00-iteration-overview.md` as the control document. Then read the folder in this order:

1. Planning: `20-iteration-execution-index.md`, `61-sprint-zero-bootstrap.md`, `62-execution-calendar-and-cadence.md`.
2. Scope and risk: `26-mvp-scope-guardrails.md`, `40-implementation-risk-triage.md`, `55-anti-patterns-and-forbidden-shortcuts.md`.
3. Tickets: `31-ticket-template-pack.md`, `35-first-sprint-ticket-cut.md`, `45-definition-of-ready-for-tickets.md`.
4. Execution: `10-build-order-checklist.md`, `44-developer-execution-playbook.md`, `63-master-implementation-sequence.md`.
5. Verification: `11-acceptance-test-plan.md`, `41-test-fixtures-and-scenarios.md`, `47-implementation-command-checklist.md`.
6. Review and closure: `51-pr-review-rubric.md`, `56-cross-functional-review-board.md`, `60-final-go-no-go-checklist.md`.
7. Handoff: `48-operational-handoff-checklist.md`, `59-traceable-evidence-register.md`, `64-iteration-acceptance-contract.md`.

## Document Layers

- Control: overview, phase files, execution index and master implementation sequence.
- Planning: backlog, ticket breakdown, first sprint cut, prioritization matrix and readiness scorecard.
- Architecture: compliance audit, contract dependency checklist, ADR seeds and anti-patterns.
- Quality: acceptance plan, fixtures, PR rubric, command checklist and QA signoff.
- Operations: runbook, risk burndown, handoff package, operational handoff and support impact.
- Product value: scope guardrails, quality metrics, MVP value validation and beta closeout.

The master plan is the top-level delivery document. Use it first, then open the specific iteration folder.

## MVP Execution Spine

For real implementation work, do not try to read all 65 files before cutting tickets. Use this spine:

1. `10-execution-master-plan.md` - choose the sprint and lane.
2. `09-cross-iteration-dependency-map.md` - verify gates and parallel work rules.
3. `<iteration>/00-iteration-overview.md` - confirm the iteration goal, non-goals and stop gate.
4. `<iteration>/21-phase-to-ticket-map.md` - translate phases into ticket groups.
5. `<iteration>/35-first-sprint-ticket-cut.md` - choose the first implementation slice.
6. `<iteration>/45-definition-of-ready-for-tickets.md` - reject vague tickets before coding starts.
7. `<iteration>/47-implementation-command-checklist.md` - run required checks before review.
8. `<iteration>/59-traceable-evidence-register.md` - record proof before closing work.

This keeps the documentation usable during development while preserving the deeper files for review, risk control and handoff.

## Daily Use

On a normal implementation day:

1. Start from the active iteration folder.
2. Open `63-master-implementation-sequence.md` for order.
3. Open `35-first-sprint-ticket-cut.md` for the current ticket.
4. Check `45-definition-of-ready-for-tickets.md` before coding.
5. Use `22-edge-case-playbook.md` to choose edge cases.
6. Use `47-implementation-command-checklist.md` before PR review.
7. Record proof in `59-traceable-evidence-register.md`.

If a ticket needs more than one iteration's worth of scope, split it or reclassify part of it as `Extension Contract` or `Deferred`.

## First Build Path

When implementation starts, build the first runnable path before broadening scope:

```text
architecture tests -> tenant context -> topic API -> source binding API
-> fake scan -> normalized feed -> generated REST client/API harness
```

Then expand in this order:

1. Replace fake scan with HN/RSS certified adapters.
2. Add scheduler, worker lease, retry, dead-letter and cursor discipline.
3. Add dedupe/provenance feed read model.
4. Add cited summary pipeline and evals.
5. Add WebSocket progress and reconnect/resync harness.
6. Add hardening, quotas, dashboards, rollback and API/operator beta onboarding.
7. Add Flutter/other frontend later when backend loop and contracts are proven.

This path prevents horizontal platform work from hiding the fact that the user loop is not runnable.

## MVP Cutline

Use this cutline when a document or ticket feels too large:

- Build now: tenant-safe topic/source/feed/summary/realtime API status path.
- Build now: source connector SDK, fake/HN/RSS adapters, certification, scheduler, dedupe, cited summaries, evals, quotas and basic observability.
- Define only: physical microservice extraction, gRPC internals, future Reddit/X/Telegram adapters, webhooks/API-key extensions and provider fallback.
- Defer: Flutter/user frontend, broad source expansion, advanced semantic clustering, multi-agent workflows, enterprise compliance certification, multi-region deployment, full billing automation and deep analytics UI.

A good MVP ticket should be small enough to merge as one vertical slice and strong enough to avoid a future rewrite.

## Evidence Rule

Every completed implementation slice must attach proof. For MVP, proof can be compact:

- Unit/use-case tests for business rules.
- Contract or generated-client diff for API/event/schema changes.
- Certification output for source/AI adapters.
- Fixture or snapshot for edge cases.
- Screenshot/golden only when a user-visible frontend is in active scope.
- Metric/log/dashboard sample for operational behavior.
- ADR/change note for architecture or scope decisions.

Do not add heavy test infrastructure unless it blocks a real beta risk. Prefer small deterministic tests and one end-to-end smoke path.

## Critical Audit Rule

Before promoting an iteration, run the `Critical MVP Gap Audit` in `10-execution-master-plan.md` and the `Cross-Cutting Blocker Matrix` in `09-cross-iteration-dependency-map.md`.

The audit is intentionally short. It checks the risks most likely to break a strong-looking MVP:

- tenant scope in async work
- cursor/idempotency safety
- supported source access
- provider DTO leakage
- cited summaries
- quota preflight
- REST resync for realtime
- support-safe diagnostics
- generated-client/API compatibility
- beta scope control

If the active iteration cannot produce evidence for a relevant item, record it as `Yellow` with owner/deadline or `Red` and block downstream implementation.

## Status Convention

Use the same status language across every iteration:

- `Green` - evidence exists and the next phase may depend on it.
- `Yellow` - work may continue only with named owner, mitigation and deadline.
- `Red` - dependent work is blocked.
- `To review` - default planning state; it is not approval.
- `Accepted exception` - allowed only with owner, reason, rollback/mitigation and review date.

Never treat `To review` or `Accepted exception` as complete.

## Execution Rule

Each phase file contains:

- objective
- steps
- edge cases
- what to pay attention to
- acceptance criteria

Do not skip phases because "MVP". The MVP can be scoped down, but boundaries and invariants must be correct from day one.

## Delivery Principle

The MVP is successful only if this loop works end to end:

```text
workspace -> topic -> source binding -> scheduled scan -> normalized item
-> dedupe/relevance -> cited summary -> realtime status/digest -> user action
```

Everything else is expansion.

## Architecture Guardrails

- Domain entities and value objects do not import NestJS, database clients, message brokers, OpenAPI DTOs or Flutter UI classes.
- Use cases depend on ports, not adapters.
- Adapters translate external contracts into domain commands/results and never leak provider-specific payloads into core domain models.
- Events are versioned, tenant-scoped and idempotency-aware.
- REST/OpenAPI is the public backend contract for the app; gRPC is for internal service-to-service calls where request/response latency matters.
- Kafka is the durable event backbone; RabbitMQ can be used for command/job dispatch where worker semantics and retry queues are simpler.
- When Flutter is resumed, features stay feature-scoped: domain, application, infrastructure adapters and MobX presentation stores are colocated by feature.
- Every source connector must document capabilities, limits, legal/ToS constraints, failure modes and fallback behavior before production use.

## Ticket Quality Rule

Every implementation ticket must state:

- bounded context
- layer: domain, application, adapter, infrastructure, presentation or operations
- primary artifact
- contract impact
- events emitted/consumed
- tests required
- edge cases covered
- rollout or migration concern

## Iteration Closure Rule

An iteration is not complete until:

- all hard gates in `09-quality-gates-risk-register.md` pass
- open critical risks have an owner and mitigation
- contract changes are reviewed
- architectural boundary checks pass
- user-visible failure states are documented
- operations/support impact is known
- acceptance scenarios in `11-acceptance-test-plan.md` pass or are explicitly deferred with owner and reason
- operational notes in `12-operational-runbook.md` are updated with blockers, handoffs and support impact
- `13-definition-of-done.md` is satisfied without critical exceptions
- `14-traceability-matrix.md` has no unmapped critical goal, contract, test or risk
- changes to scope, contracts, events, adapters or rollout are recorded in `15-change-control.md`
- `16-estimation-and-resourcing.md` is reviewed for bottlenecks, required owners and no-cut areas
- PRs and architecture changes pass the relevant checks in `17-review-checklists.md`
- key decisions are recorded in `18-decision-log.md` with rationale, consequences and revisit trigger
- role ownership and handoff points in `19-role-based-execution-plan.md` are complete
- `20-iteration-execution-index.md` has a clear reading and execution order
- every phase maps to ticket groups and closure evidence in `21-phase-to-ticket-map.md`
- edge cases in `22-edge-case-playbook.md` have validation and mitigation paths
- deliverables in `23-deliverables-checklist.md` are present or explicitly deferred with owner and reason
- daily execution sequence in `24-day-by-day-sequence.md` is reviewed and adjusted to actual team capacity
- risk-first priorities in `25-risk-based-priority.md` are reviewed before implementation starts
- scope decisions in `26-mvp-scope-guardrails.md` are respected or changed through explicit change control
- open questions and assumptions in `27-open-questions-and-assumptions.md` have owners and decision deadlines
- readiness score in `28-implementation-readiness-scorecard.md` is green or has explicit accepted exceptions
- quality metrics in `29-quality-metrics-and-kpis.md` are measurable or explicitly marked as not applicable
- `30-executive-brief.md` matches the current iteration plan and transition gate
- tickets created from the iteration follow `31-ticket-template-pack.md`
- `32-handoff-package.md` is complete before the next iteration starts
- `33-implementation-start-checklist.md` is green before implementation begins
- `34-engineering-kickoff-agenda.md` has been reviewed with owners before the first implementation day
- `35-first-sprint-ticket-cut.md` is converted into actual tickets before sprint work begins
- `36-sprint-review-demo-script.md` is used to review evidence before iteration progress is accepted
- `37-retrospective-improvement-log.md` is filled before the next iteration absorbs carryover work
- `38-architecture-compliance-audit.md` has no unresolved critical violation before closure
- `39-contract-dependency-checklist.md` has no unresolved blocking contract dependency before transition
- `40-implementation-risk-triage.md` has no unresolved critical risk without owner, mitigation and stop condition
- `41-test-fixtures-and-scenarios.md` has enough fixtures to prove happy paths, negative paths and edge cases
- `42-release-gate-and-promotion.md` has explicit approval, hold or rollback decision before transition
- `43-production-readiness-gap-analysis.md` separates accepted MVP gaps from production blockers with owner and follow-up
- `44-developer-execution-playbook.md` is used by implementers before opening PRs or changing contracts
- `45-definition-of-ready-for-tickets.md` is satisfied before a ticket enters active development
- `46-qa-acceptance-signoff.md` is approved before the iteration is considered accepted
- `47-implementation-command-checklist.md` has recorded command/evidence results before review or merge
- `48-operational-handoff-checklist.md` is complete before support or the next iteration accepts ownership
- `49-scope-change-decision-tree.md` is applied before any new request changes iteration scope, contracts or launch gates
- `50-iteration-closeout-summary.md` confirms outputs, gates, blockers, carryover and next-step readiness
- `51-pr-review-rubric.md` is applied before PR approval or merge
- `52-architecture-decision-record-seeds.md` has ADRs created for decisions that affect future architecture or contracts
- `53-team-ownership-and-communication.md` has owners, reviewers, sync points and escalation paths assigned
- `54-mvp-value-validation-checklist.md` confirms the iteration improves the end-to-end MVP value loop
- `55-anti-patterns-and-forbidden-shortcuts.md` has no violated non-negotiable rule before closure
- `56-cross-functional-review-board.md` has required approvals or explicit exceptions before promotion
- `57-backlog-prioritization-matrix.md` is used before sprint backlog is committed
- `58-risk-burndown-and-control-points.md` shows critical risks reduced or explicitly accepted with owner before closure
- `59-traceable-evidence-register.md` links each critical claim to evidence before promotion
- `60-final-go-no-go-checklist.md` records a go, hold or rework decision with owner and evidence
- `61-sprint-zero-bootstrap.md` is complete before the first implementation ticket starts
- `62-execution-calendar-and-cadence.md` is followed or explicitly adjusted before missed checkpoints become blockers
- `63-master-implementation-sequence.md` is used as the final execution order for the iteration
- `64-iteration-acceptance-contract.md` is accepted by the receiving owner before promotion
