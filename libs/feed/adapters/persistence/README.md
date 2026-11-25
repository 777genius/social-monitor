# Feed Persistence Adapter

Prisma and SQL access for feed read models belongs here. Domain and feature slices must depend on ports, not Prisma models.

Promotion reads run their complete physical keyset scan in one read-only
`REPEATABLE READ` transaction. Published windows use
`(published_at DESC, id DESC)` and observed windows use
`(observed_at DESC, id DESC)`. The internal cursor carries only the last row
ID; Prisma resolves that row's exact PostgreSQL `timestamptz(6)` value inside
the transaction, so no page key is rounded through a JavaScript `Date`.
Pages never escape that one MVCC snapshot.
`published_at` and `observed_at` are create-only projection fields.

The scan evaluates at most 100,000 feed rows and materializes at most 1,000
strict canonical promotion candidates. A one-row ceiling probe or a 1,001st
eligible candidate produces a typed conflict; no partial promotion set is
returned. The in-memory adapter copies its collection before applying the same
window, ordering, eligibility, and ceiling rules. Published-order pages do not
put the observation cutoff in the index predicate: every returned row counts
as visited work before exact `observed_at <= cutoff` and canonical eligibility
are applied. Observed-order pages use exact `[start,end)` plus `<= cutoff`.

The four promotion indexes are installed concurrently by migration
`20260819120000_feed_promotion_keyset_snapshot_indexes`. The production
database is externally managed: application hosts neither mount nor inspect
PostgreSQL `PGDATA`, and deploys do not use `df` as a database-capacity
preflight. The migration has finite lock and statement timeouts and is
serialized with a session advisory lock while each index is built outside a
transaction. Before and after deploy, recovery verifies the four exact catalog
definitions and validity/readiness flags. Operators provision capacity through
the managed database provider's own controls and monitoring.

Recovery touches only these four allowlisted names. Missing indexes are built
concurrently; invalid or definition-mismatched instances are dropped
concurrently first. Only an allowlisted, old, inactive, zero-step Prisma
failure with the exact migration, SQL/index identity, PostgreSQL code, and
message fingerprint may be resolved with `prisma migrate resolve --rolled-back`
before `prisma migrate deploy`. Lock contention, timeout, fresh/active/partial,
and unknown failures require operator review. Post-deploy catalog verification
requires all four definitions to be exact.

The legacy provider-signal list remains unchanged: it sorts only the newest
1,000 physical rows to avoid an unbounded score materialization.
