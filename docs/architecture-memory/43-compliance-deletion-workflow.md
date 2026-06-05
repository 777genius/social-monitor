# Compliance Deletion Workflow

Date: 2026-05-31
Status: baseline compliance deletion memory

## Decision

Deletion/tombstone handling is a P0 workflow. It must outrank enrichment, backfill and normal ingestion.

References:

- GDPR Article 17 Right to Erasure: https://gdpr-info.eu/art-17-gdpr/
- GDPR Article 25 Data Protection by Design: https://gdpr-info.eu/art-25-gdpr/
- X Developer Policy: https://developer.x.com/en/developer-terms/agreement-and-policy/source.html
- Reddit Data API Terms: https://redditinc.com/policies/data-api-terms

## Content States

```text
active
stale_needs_recheck
deleted_at_source
modified_at_source
restricted
tombstoned
purged
legal_hold
```

## Workflow

```text
deletion signal detected
-> create compliance_deletion_event
-> mark source item deleted/tombstoned
-> stop future use in summaries/digests
-> update/delete derived summaries if required
-> enqueue raw payload purge
-> enqueue search/vector/read-model removal
-> enqueue analytics/warehouse deletion marker
-> record audit evidence
```

## Derived Data

Derived data handling depends on source policy and privacy request type.

Possible actions:

- remove source citation;
- regenerate summary without deleted source;
- tombstone summary;
- purge summary;
- keep aggregate cost/audit record without source text.

## Backups

Backups must not resurrect deleted data.

Required:

- tombstone ledger;
- post-restore deletion replay;
- backup retention policy;
- legal hold exception handling.

## Search/Vector Removal

Deletion must propagate to:

- feed read models;
- full-text indexes;
- pgvector embeddings;
- clusters;
- summary references;
- object storage raw payloads;
- warehouse/export pipelines.

## Locked Decisions

1. Deletion/tombstone workflow is P0.
2. Deletion applies to derived data, not only raw rows.
3. Backup restore requires deletion replay.
4. Search/vector/read-model removal is part of deletion.
5. Legal hold blocks purge but not audit visibility controls.

