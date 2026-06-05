# Streaming Ingestion

Date: 2026-05-31
Status: baseline streaming ingestion memory

## Decision

Streaming ingestion uses a separate flow from polling ingestion.

Do not connect high-volume streams directly to Postgres inserts, summarization or expensive AI.

Applies to:

- Bluesky/AT Protocol firehose;
- future realtime APIs;
- provider streams;
- websocket/social streams;
- federated/open protocol streams.

References:

- Bluesky Firehose: https://docs.bsky.app/docs/advanced-guides/firehose
- Kafka Streams core concepts: https://kafka.apache.org/33/streams/core-concepts/

## Required Flow

```text
stream
-> lightweight filter
-> bounded queue
-> normalizer
-> dedupe
-> relevance
-> storage/summary jobs
```

## Required Controls

- stream checkpoint/cursor;
- backpressure;
- filtering before persistence;
- bounded buffers;
- drop/degrade policy;
- dead-letter stream for malformed events;
- replay/backfill strategy if stream gap occurs;
- tenant/source budget guard;
- per-source throughput limit.

## Firehose Rule

Firehose ingestion must not write everything.

Store only:

- relevant normalized items;
- permitted raw refs;
- quality/debug samples where policy allows.

## Local Development

Redpanda may be used locally as a Kafka API-compatible broker to reduce local complexity, but production Kafka/managed Kafka choice remains separate.

Reference:

- Redpanda quickstart: https://docs.redpanda.com/current/get-started/quick-start/

## Locked Decisions

1. Streaming ingestion is not polling with a faster loop.
2. High-volume streams are filtered before persistence.
3. Streaming data cannot bypass dedupe/relevance/cost controls.
4. Stream gaps require explicit replay/backfill strategy.
5. Redpanda is acceptable for local Kafka-compatible development.

