# Legacy boundary refactor — 2026-11-06

**Status:** Draft, staged implementation; do not merge until final review/CI.  
**Baseline:** `83ad558cbc6ba419c755375c65aa3f7c3cf418b9` (`main`).  
**PR scope:** existing backend/quality-test code only. No production deployment.

## 1. Objective and hard boundaries

Reduce verified legacy architecture debt without changing behavior, wire contracts,
persistence, runtime profiles, provider eligibility, source readiness or UI. Aim
for **10–20k meaningful changed lines across a staged review**, but do **not**
pad the diff or broaden scope to hit a numerical quota. Stop at the last
independently justified, proven safe boundary. This is an existing modular
NestJS/TypeScript backend with DDD-like bounded contexts, **not a greenfield
Clean Architecture rewrite**.

The existing `docs/plans/ingestion-scan-foundation-refactor-20261105.md`
covers acquisition/scheduler/worker extraction. Do not duplicate that work.
`docs/plans/2026-10-30-architecture-reliability-foundation.md` and
`docs/plans/2026-11-04-scan-and-queue-foundation.md` record substantial
previously completed fixes. Historical findings marked complete there must
not be presented as newly discovered failures.

No blanket file/folder deletes. Preserve ambiguous compatibility aliases,
legacy data readers, archived evidence, migration fixtures and public exports.
Remove only after exact reference search, explicit ownership evidence, and
behavioral tests. No speculative general repository abstraction, service
split, new DI framework, feature flags, new versioned APIs, DTO renames, forced
folder migration, or dependency upgrades. Existing `.mts` tooling remains
untouched; new TypeScript source uses `.ts`.

## 2. Verified repository baseline

- 7,823 files across 977 directories in `main` at the baseline commit,
  including generated code, archived documentation and fixtures.
- Approximately 2,931 TS/Dart source-like files under `apps` and `libs`
  after excluding common generated and spec/test suffixes; **not all of
  these are production source**.
- Backend owners already map to `libs/{monitoring,ingestion,summary,relevance,
  feed,delivery,identity,subscriptions,...}`; Nest apps are composition roots.
- Frontend is Flutter with `modularity_flutter`; changing Flutter composition
  would require live Marionette and FVM checks, so Flutter is excluded.
- The backend architecture guard and the root `AGENTS.md` prohibit cross-context
  inward imports, hidden environment configuration and changes to behavior
  under the 1,000-line file-cap exceptions.
- The `scripts/check-source-line-cap.mjs` baseline has **15 explicit debt
  exemptions**. These are concrete removable legacy guardrail exceptions,
  with files from 1,013 to 4,268 lines.
- Open production-deployment PR #620 must not be modified or merged by this
  refactor; no work on the production deploy lifecycle or production credentials.

This is a **structural baseline**, not proof that each identified file is buggy.

## 3. Proposed change inventory and priorities

| Priority | Workstream | Evidence / reason | Allowed implementation | Acceptance |
| --- | --- | --- | --- | --- |
| P1 | Test fixture decomposition | The monitoring daily-history spec is 1,055 LOC and grandfathered by the line-cap gate | Move unchanged fakes and fixture builders into sibling `*.spec-support.ts`; keep tests and production API unchanged; remove its exact debt entry | Same assertions, full Jest spec pass, line cap passes with no exception |
| P1 | Quality / evidence checker decomposition | `check-external-beta-evidence-runner.mjs` 4,268 LOC; `check-staging-reliability-evidence.mjs` 2,203; `external-beta-evidence-runner.mjs` 2,113; `check-source-live-certification-evidence.mjs` 2,078 | Extract **named, locally owned pure validators** or static fixture builders, retaining CLI entrypoints and error/report/output formats | Independent positive and negative evidence fixtures produce identical results; exemptions removed one at a time |
| P1 | Operational E2E harness decomposition | `capture-durable-backend-e2e-loop.ts` 2,348 and `docker-backend-evidence-harness.mjs` 1,174 | Separate setup/teardown fixtures from assertions, preserve cleanup and deterministic lifecycle, avoid helper side effects on import | Safe sandbox E2E/replay and failure cleanup, no production project or real credentials |
| P2 | Other oversized checks | `check-credential-secret-runtime-flow.mjs` 1,122; `check-delivery-prisma-persistence.ts` 1,291; `check-security-final-sweep.mjs` 1,332; `check-source-provider-runtime-contract.ts` 1,475; `check-summary-feedback-hardening.mjs` 1,328; `check-reader-summary-rest-smoke.ts` 1,199; `check-release-artifact-evidence.mjs` 1,062; `check-source-binding-health-rest-smoke.ts` 1,013 | Split by existing responsibilities and retain all external behavior, file paths, flags and exit codes | Dedicated check + regression coverage before deleting each exception |
| P2 / separate consent | Any domain/application restructuring identified from production code | Large `summary` context has many 15–30 KB policies, adapters and value objects, but size alone is insufficient proof of architectural defect | Only if actual dependency-direction failure, duplication with a shared reason to change, or excessive responsibility is demonstrated | Explicit before/after dependency map and regression tests; otherwise defer |

**Do not claim the whole inventory has been implemented** when only one
stage is merged. Stages may stop short of the target line count if doing more
would require unsafe rewriting or behavior changes.

## 4. SOLID / DDD / module-boundary target

- Keep existing bounded contexts and their public barrels. Domain code has no
  Nest/Prisma/RabbitMQ/HTTP/generator imports.
- Application/use-case code invokes domain policy and inner contracts; interfaces
  translate transport; infrastructure translates SDK/DB/broker; apps wire it.
- Prefer private, context-local helpers over cross-context `common/utils`.
- Split a file when two independent change reasons exist; do not split a
  stable cohesive entity solely due to a size metric under the cap.
- Preserve all tenant/workspace scopes and idempotency, cursor, lease, retry,
  settlement, publication and cost-reporting semantics as invariants.
- `get-modular` Core/Assembly are optional **product-host composition tools**.
  They do not replace Nest's current host and do not own authorization or
  lifecycle. No migration or dependency addition in this scope. Consider only
  a separate, measured, ADR-backed host integration if a concrete problem
  remains after small local extraction.
- Preserve `modularity_flutter` frontend boundaries unchanged.

## 5. Implementation slices and commit discipline

### Stage 0 — audit / compatibility baseline
1. Pin baseline SHA and inspect all existing rules, plans and active PR overlap.
2. Record each candidate's caller/CLI/runtime interface, test ownership and
   risk of hidden side effects.
3. Read each candidate file fully, not just search snippets. Never delete by
   filename or the word 'legacy' alone.
4. Capture before-state stdout/stderr/exit code for deterministic fixtures
   wherever execution is available.

### Stage 1 — minimal safe proof: monitoring history spec
1. Move the six fake repository implementations plus fixture composers into
   one sibling test-support module. Import it into the original spec.
2. Preserve test names, order, scenario data, clock, tenant/workspace and
   assertions byte-for-byte. Do not edit the production use case.
3. Remove only the matching 1,055-LOC exception from the line-cap map.
4. Run targeted Jest spec, TypeScript build, architecture, code-quality,
   source-line-cap and affected GitHub CI. Do not merge a draft with unknown
   execution status.

### Stage 2 — evidence validators (separate independently proven files)
1. For each oversized CLI choose **one** cohesive parser/validator/executor
   boundary. Preserve import-time behavior and cwd/path handling.
2. Move tests or fixtures to support modules, not into production code.
3. Lock exact JSON schemas, error ids, hashes, ordering, credential-redaction
   behavior, stdout/stderr, exit status and offline/live evidence distinction.
4. Measure LOC/debt after every file and remove only a proven cleared exception.

### Stage 3 — E2E harness / operational check scripts
1. Separate isolated fixture state from orchestration and external effects.
2. Verify resource teardown, timeout, retries and failure-first cleanup with
   bounded, synthetic projects/services.
3. Avoid all deploy/release commands, real provider calls or user projects.
4. Each split must preserve the original public script entrypoint and scripts
   in `package.json`.

### Stage 4 — optional production architecture follow-ups
Only justified defects observed in production code after Stage 1–3 and **not**
owned by other open PRs. One bounded context and use case per change group,
with focused regression tests. Stop rather than combining unsafe changes.

### Stage 5 — strict review and closeout
1. Compare diff with base for scope creep, renamed or deleted compatibility
   artifacts, generated code and unexpected migration/config modifications.
2. Re-read every changed file on final HEAD.
3. Run targeted suites and full **safe** PR CI; run broker/Postgres/Flutter
   integration only where necessary and supported, reporting unavailable gates.
4. Address substantive review findings, repeat review on latest HEAD; do not
   count automation timeouts as approvals.
5. Keep Draft until all in-scope gates and review findings are clear. Only
   then request a safe merge decision (no production deployment authorized).

**Pushing:** each self-contained commit goes immediately to the single Draft
PR branch, `refactor/legacy-boundaries-20261106`. Never stack PRs for the same
stage or modify `main` directly. Preserve other authors' intervening work.

## 6. Risk register and stop criteria

| Risk | Severity | Prevention / check |
| --- | --- | --- |
| An extracted helper has an import-time side effect or changed `import.meta.url` | High | Keep entrypoint-specific path resolution in entrypoint; compare side effects and CLI output |
| Evidence checker accidentally accepts fabricated or unredacted secrets | Critical | Negative tests fail closed; prohibit real keys, ensure evidence schemas and deny markers remain identical |
| RabbitMQ/Postgres/scan historical state changes from "cleanup" | Critical | No changes to those domain semantics; isolated integration if a necessary edit is found |
| Type-only imports escape dependency-direction checks | High | Existing architecture gate and TypeScript compilation; no new framework from domain |
| Test-support refactor loses coverage while reducing file size | High | Preserve test bodies, names and fake behavior; count assertions/scenarios |
| `get-modular` creates two competing lifecycle owners | High | No adoption here; prefer Nest composition and explicit context contracts |
| CI passes but full real E2E never ran | Medium | Report precise checks and limitations; do not conflate fixture and production |
| Parallel PR changes move the baseline | High | Compare exact SHAs before each write and rebase only with reviewed conflicts |

**Abort a proposed slice** if preserving public behavior requires guessed
semantics, tests cannot encode the original invariant, or the move would add
a new layer/framework without an observed reason.

## 7. Adversarial plan review — three distinct checks, not external agent approvals

> These are explicit design critiques performed while constructing the plan,
> **not claims that independent remote models were invoked**. External GitHub
> review and final changed-code review remain pending.

**Architecture/SOLID critic, round 1:** A broad "move all backend folders to
canonical DDD names" proposal duplicates the already established bounded-context
layout and breaks imports. **Correction:** preserve backend `ports/adapters`
as accepted legacy vocabulary until an independently valuable migration exists;
extract responsibilities in place.

**Reliability/security critic, round 2:** "Delete legacy code" would wrongly
remove compatibility readers, archival evidence, operational recovery scripts,
or change migration hash/lease semantics. **Correction:** no blind deletion;
scope targets oversized guarded checks/tests, no production semantics; require
negative fixture parity for evidence and secrets.

**Scope/verification critic, round 3:** "10–20k lines" risks churn for its own
sake; frontend and infrastructure deployment are different risk domains, and
the current environment may not run live Flutter/Postgres/Docker. **Correction:**
line target is informational, stages are independently testable, draft stays
open if CI/E2E is incomplete, and environment limitations are reported.

**Post-implementation review still required:** at least two changed-code passes
(architecture/interface + adversarial safety/behavior), plus project CI and
available external PR reviews. Fix material findings in the same PR. A reviewer
comment, bot summary or empty automated review is not approval.

## 8. Evidence log

- Baseline audit: `main` `83ad558cbc6ba419c755375c65aa3f7c3cf418b9`; existing rule and plan inventory read.
- Planned branch: `refactor/legacy-boundaries-20261106`.
- Staged cleanup pushed: monitoring history Jest fixture, source-binding REST smoke helpers,
  reader-summary REST smoke fixtures/assertions and delivery Prisma smoke fake client.
  Each original test or main scenario body was retained. Matching LOC exceptions
  removed: **4**, reducing the baseline from **15 to 11**.
- Stage 1–2 verification: **pending exact-head CI and E2E**; pushing a commit
  is not the same as passing the corresponding test. Backend test/E2E jobs
  explicitly skip Draft pull requests under `.github/workflows/pull-request.yml`.
  Before asserting completion, they must be executed against the same HEAD
  through the repository's supported ready-for-review or workflow-dispatch
  route; neither is claimed here.
- Stage 2–5 implementation and review: **not yet complete**.
- No production deployment, merge, or external agent review is claimed.
