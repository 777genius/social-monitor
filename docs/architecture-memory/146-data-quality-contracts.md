# 146. Data Quality Contracts

## Status

Locked for data reliability baseline.

## Research Anchors

- Great Expectations expectations overview: https://docs.greatexpectations.io/docs/cloud/expectations/expectations_overview/
- OpenLineage documentation: https://openlineage.io/docs/

## Decision

Treat data quality as explicit contracts for source ingestion, normalized items, summaries, projections and analytics exports.

## Quality Dimensions

| Dimension | Examples |
|---|---|
| freshness | scan completed within policy delay |
| completeness | expected fields present after normalization |
| uniqueness | no duplicate `(tenant, source_kind, source_item_id)` |
| validity | enum/language/timestamp values valid |
| consistency | source binding state matches scheduler state |
| referential integrity | summary points to existing cluster/items |
| volume anomaly | item count spike/drop by source/topic |
| cost anomaly | AI/source cost spike per tenant |

## Contracts

Define checks for:

- `source_binding`;
- `scan_run`;
- `raw_payload_metadata`;
- `normalized_item`;
- `content_cluster`;
- `summary_artifact`;
- `digest`;
- `notification_delivery`;
- analytics export tables.

Checks run in CI for fixtures and in production as scheduled jobs/monitors.

## User Impact

Data quality failures must map to user-visible states where relevant:

- stale source;
- partial digest;
- summary delayed;
- source credentials need attention;
- provider quota exhausted.

## Best-Fact Choice

Data quality is product reliability. A green API health check is meaningless if feed data is stale, duplicated or silently incomplete.

