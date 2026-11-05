# Delivery Persistence Adapter

Prisma and SQL access for delivery attempts belongs here. Domain and feature slices must depend on ports, not Prisma models.

## Dispatch and execution

`application/contracts/delivery-attempt-workflow.ts` owns two separate capabilities:

- dispatch commits a dispatchable attempt's `assembling` transition together with
  its `delivery.attempt.send` COMMAND outbox row;
- execution claims, renews, starts and settles a tenant/workspace-scoped attempt
  using a generated ownership token and expiry. A stale token cannot settle it.

The Prisma workflow store uses short Serializable transactions and the shared
write-conflict retry helper. Preference reads, signing and provider requests run
outside database transactions. A failed outbox insert rolls back dispatch state.
The process-local implementation keeps both the state transition and pending
command together before its relay can observe them; it uses the same command
outbox dispatcher and transition policies as the durable implementation.

The event-relay process publishes durable delivery commands using delivery's
exchange, queue and dead-letter settings. The delivery dispatch loop flushes the
process-local outbox in in-memory mode. Publication retries keep the same command
identity. A consumed failed command cannot spend another provider retry: a new
dispatch commits a new command generation. Completed and superseded commands
acknowledge the current durable state without calling the provider.

## Recovery semantics

The composition uses a five-minute execution lease and five-minute abandoned
dispatch threshold, supplied explicitly to the use cases/dispatch loop. While
preferences, signing or a provider request is running, a heartbeat renews the
lease every third of its duration. Failed renewal aborts the provider's optional
signal and prevents settlement by the old owner. Provider transports must honor
abort and their own bounded request deadline; the lease does not replace that
deadline.

Polling includes expired `sending` and `assembling` ownership, and old
`assembling` rows that have no execution owner. Recovery records a retryable
failure, spends the existing retry budget, and either dispatches again or
dead-letters the exhausted attempt. Suppression is terminal and is not recovered.
The attempt's provider idempotency key remains stable through all recovery.

External delivery remains **at least once**. A provider can accept a request
before the worker loses its process or the database acknowledgement; recovery can
send it again. Recipients/providers should deduplicate the stable idempotency
key. Fencing guarantees ownership of database state, not atomicity between the
provider and database.

## Upgrade and verification

Drain old delivery producers/consumers before upgrading to the new workflow.
Migration `20261030160100_delivery_dispatch_execution_claims` is additive and
preserves existing rows, but old binaries do not understand ownership fencing.
Existing active rows without metadata become eligible for bounded recovery after
their recorded transition age exceeds the recovery threshold.

Focused integration specs live in `test/integration/delivery`, with small
contract-mocked sibling use-case specs. The real Prisma/PostgreSQL regression is:

```sh
DELIVERY_WORKFLOW_TEST_DATABASE_URL=<explicit-local-test-database> npm run check:delivery-workflow-postgres
```

It rejects remote or non-test database URLs, creates random tenant/workspace
fixtures, and removes only its own scoped rows. It verifies concurrent dispatch,
one provider owner, completed replay, transaction rollback, expired execution,
stale settlement, workspace scope and superseded command generations.
