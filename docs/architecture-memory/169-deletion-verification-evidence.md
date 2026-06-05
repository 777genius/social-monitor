# 169. Deletion Verification and Evidence

## Status

Locked for privacy/compliance baseline.

## Research Anchors

- European Commission right to erasure guidance: https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/dealing-citizens/do-we-always-have-delete-personal-data-if-person-asks_en
- European Commission personal data explainer: https://commission.europa.eu/law/law-topic/data-protection/reform/what-personal-data_en

## Decision

Deletion workflows must produce evidence of completion across canonical stores, projections, object storage, search/vector indexes and queued work.

## Verification Checklist

For tenant/account deletion:

- canonical Postgres records deleted/anonymized according to policy;
- object storage raw payloads/artifacts removed or expired;
- embeddings removed;
- search indexes rebuilt/deleted for affected ids;
- analytics export deletion/tombstone emitted where applicable;
- pending jobs cancelled or made no-op;
- credentials revoked/deleted;
- webhook/API keys revoked;
- cache entries invalidated;
- audit evidence retained minimally where legally allowed/required.

## Evidence Record

Store:

- deletion request id;
- requester/approver;
- scope;
- data classes processed;
- counts by store;
- failed/skipped classes with reason;
- completion timestamp;
- retention exceptions;
- verification job version.

## Backups

Backups may retain data until backup expiry. Record backup retention window and ensure restored backups replay deletion tombstones before serving production traffic.

## Best-Fact Choice

Deletion is not done when the main row is gone. Derived stores, queues, caches, backups and credentials must be accounted for.

