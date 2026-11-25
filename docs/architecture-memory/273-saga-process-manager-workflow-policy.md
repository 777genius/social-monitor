# 273 - Saga Process Manager Workflow Policy

## Decision

Use simple transactional use cases for local atomic work.

Use process managers or durable workflows for long-running, multi-step, cross-service workflows that need retries, waiting, compensation or human approval.

## Sources

- Temporal documentation: https://docs.temporal.io/
- Temporal durable execution overview: https://docs.temporal.io/temporal
- Temporal timeouts/retries concepts: https://docs.temporal.io/develop
- Camunda compensation handlers: https://docs.camunda.io/docs/components/modeler/bpmn/compensation-handler/

## When To Use A Saga/Workflow

Use for:

- source connection onboarding with OAuth, validation and policy acceptance
- tenant export generation/delivery
- deletion/DSR workflows
- billing plan change with entitlement updates
- scheduled digest assembly/delivery
- large backfills
- multi-provider summary generation
- support access approval flow

Do not use for:

- simple topic create/update
- single database transaction
- straightforward CRUD
- hot-path feed reads

## Process Manager State

Persist workflow state:

- workflow id
- tenant id
- current step
- completed steps
- retry counts
- compensation status
- failure reason
- waiting signals
- trace id

State must be inspectable by operators.

## Compensation

Compensation is not rollback.

It is a business operation that semantically reverses or mitigates a completed step.

Examples:

- revoke generated export URL
- disable source binding after credential validation fails
- reverse entitlement update
- mark digest delivery canceled
- delete partially generated artifact

## Temporal Boundary

Temporal is a strong candidate when:

- workflows wait minutes/days
- retries must survive worker restarts
- steps need timers/signals
- process visibility matters
- idempotent activities are already designed

Temporal workflow code must stay deterministic. External calls live in activities.

## MVP Approach

MVP can start with explicit process-manager tables and RabbitMQ jobs for short workflows.

Introduce Temporal when workflow complexity and duration justify operating it.

## Idempotency

Every activity/step needs:

- idempotency key
- side-effect receipt
- retry policy
- timeout
- compensation plan where needed

## Architecture Rule

Use database transactions for local consistency.

Use workflows/sagas for long business processes.
