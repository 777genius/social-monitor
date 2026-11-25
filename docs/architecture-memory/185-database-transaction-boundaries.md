# 185. Database Transaction Boundaries

## Status

Locked for persistence baseline.

## Research Anchors

- PostgreSQL transaction isolation: https://www.postgresql.org/docs/current/transaction-iso.html
- PostgreSQL SET TRANSACTION: https://www.postgresql.org/docs/current/sql-set-transaction.html

## Decision

Application use cases define transaction boundaries. Do not let repositories silently start unrelated nested business transactions.

## Rules

- One command use case usually maps to one database transaction.
- Transaction includes aggregate changes plus outbox insert.
- External provider calls should not happen inside open DB transactions.
- Long-running workflows are split into state transitions and jobs.
- Use explicit row locks only where needed for invariants.
- Retry serialization/deadlock failures at application boundary with idempotency.

## Isolation

Default: PostgreSQL `READ COMMITTED`.

Use stronger isolation or explicit locking for:

- quota reservation;
- idempotency command record creation;
- billing/usage ledger updates;
- source cursor advancement;
- scheduler work claiming;
- deletion workflow state transitions.

## Anti-Patterns

- Holding transaction while calling Reddit/X/LLM/email provider.
- Updating multiple bounded contexts' tables directly in one command.
- Relying on read-before-write without unique constraints.
- Swallowing serialization/deadlock errors without retry/alert.

## Best-Fact Choice

Transaction scope is an architecture decision. Short, explicit transactions plus outbox and idempotency are safer than large distributed-style transactions.

