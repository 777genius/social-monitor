# Ingestion & Connectors

## Source Connector Port

Every source implements the same application-level contract.

```ts
interface SourceConnectorPort {
  sourceType: SourceType;
  validateConfig(config: SourceConfig): Promise<ValidationResult>;
  planScan(input: ScanPlanInput): Promise<ScanPlan>;
  executeScan(input: ExecuteScanInput): AsyncIterable<DiscoveredSourceItem>;
  refreshCursor(input: CursorRefreshInput): Promise<SourceCursor>;
  getRateLimitState(accountId: ConnectorAccountId): Promise<RateLimitState>;
}
```

## Connector Runtime

Connectors are semi-trusted infrastructure, not core domain code.

Requirements:

- isolated runtime boundary;
- minimal permissions;
- narrow network egress;
- per-source credentials;
- resource limits;
- no direct writes to core product tables;
- output only through connector ports/events.

Connector state machine:

```text
planned -> leased -> rate_limited -> fetching -> partially_succeeded
-> succeeded -> failed_retryable -> failed_permanent -> cancelled -> quarantined
```

## Connector SDK

Create `packages/source-connector-sdk/` with:

- typed config validation;
- credential access abstraction;
- rate-limit helper;
- cursor helper;
- idempotency helper;
- raw payload writer;
- canonical item builder;
- metrics/logging/tracing helpers;
- cost reporting helper;
- certification test harness.

New connectors should mostly contain source-specific mapping/fetching code, not repeated platform plumbing.

## Source Topology

Classify every source by topology:

```text
official_api_polling
official_api_streaming
public_feed_polling
permissioned_webhook
permissioned_bot_polling
provider_job
provider_stream
open_protocol_federated
manual_import
```

Examples:

```text
HN: official_api_polling
RSS: public_feed_polling
Reddit: official_api_polling
X: official_api_polling or provider_job
Telegram: permissioned_webhook / permissioned_bot_polling
ActivityPub: open_protocol_federated
Bluesky: official_api_streaming/open_protocol_stream
Matrix: permissioned API
```

References:

- ActivityPub: https://www.w3.org/TR/activitypub/
- Bluesky Firehose: https://docs.bsky.app/docs/advanced-guides/firehose
- Mastodon API: https://docs.joinmastodon.org/api/
- Matrix Client-Server API: https://spec.matrix.org/latest/client-server-api/

## Scheduling

Scheduler must be quota/cost/health aware:

```text
effective_next_run_at = max(
  user_requested_interval,
  source_min_interval,
  tenant_budget_recovery_at,
  provider_quota_recovery_at,
  circuit_breaker_until,
  worker_capacity_slot,
  compliance_hold_until
)
```

Priority classes:

```text
P0 compliance deletion
P1 user-triggered refresh
P2 high-priority scheduled scan
P3 normal scans
P4 backfill
P5 enrichment
```

No unbounded connector, summary, webhook, replay or backfill loops.

## RSS Fetching

RSS/RSSHub connector must use conditional HTTP requests and RSS freshness hints:

- `ETag`;
- `Last-Modified`;
- `If-None-Match`;
- `If-Modified-Since`;
- `304 Not Modified`;
- RSS `ttl`, `skipHours`, `skipDays`.

References:

- RSS 2.0 Specification: https://www.rssboard.org/rss-specification
- RFC 9111 HTTP Caching: https://www.rfc-editor.org/rfc/rfc9111.html

