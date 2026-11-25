# Iteration 01 - Master Implementation Sequence

## PR Slice Rule
- One PR should change one platform concern: scaffold, local infra, migrations, outbox/idempotency or baseline API contract.
- Each PR must build and preserve import boundaries.
- Split if it mixes schema changes, broker wiring and API DTO changes without one rollback story.

## Step 1 - Open Control Docs
- Read build-order checklist, developer playbook and definition of ready.
- Confirm backend, platform, contract and QA owners.
- Check sprint-zero bootstrap blockers.

## Step 2 - Cut Tickets
- Scaffold monorepo.
- Add local infrastructure.
- Add persistence and migrations.
- Add outbox and idempotency.
- Add baseline REST/OpenAPI.

## Step 3 - Execute In Order
- Establish folder/module boundaries before feature code.
- Make migrations repeatable before dependent tables grow.
- Implement idempotency before write-heavy flows.
- Generate OpenAPI from code.

## Step 4 - Validate
- Run build, lint, tests, import-boundary checks and migrations.
- Verify duplicate-command behavior.
- Apply PR rubric and architecture compliance audit.

## Step 5 - Close
- Fill final go/no-go.
- Handoff local infra, migrations, OpenAPI and outbox/idempotency to ingestion.
- Promote only when ingestion can use stable platform primitives.
