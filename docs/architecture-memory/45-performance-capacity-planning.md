# Performance & Capacity Planning

Date: 2026-05-31
Status: baseline performance memory

## Decision

Capacity planning must be source-aware and cost-aware.

The system bottlenecks will differ by source:

- HN/RSS: cheap polling, normalization, dedupe.
- Reddit: API quota and pagination.
- X: API/provider cost and access limits.
- Telegram/Matrix: permissioned event throughput.
- Streams/firehose: filtering/backpressure.
- AI: token cost, latency and schema validity.

## Capacity Dimensions

Track:

```text
tenants
topics per tenant
source bindings per topic
scheduled scans per hour
items discovered per scan
normalization throughput
dedupe throughput
embedding jobs per hour
summary jobs per hour
digest sends per hour
webhook deliveries per hour
raw payload storage growth
cost per tenant/day
```

## Load Tests

Required k6/load scenarios:

- feed pagination;
- create/update topic rules;
- manual scan trigger;
- WebSocket notification burst;
- webhook delivery burst;
- admin failed-runs view;
- summary preview endpoint.

Worker load tests:

- scheduler due-scan fanout;
- connector queue pressure;
- summary job throughput;
- DLQ/retry pressure;
- compliance deletion backlog.

## Capacity Guardrails

Every background process needs:

- max concurrency;
- max runtime;
- max attempts;
- max cost;
- max rows/items;
- timeout;
- circuit breaker;
- metrics.

## Scaling Rules

Scale API by:

- CPU;
- request latency;
- error rate.

Scale workers by:

- queue depth;
- consumer lag;
- job age;
- provider quota availability;
- budget availability.

Do not scale Kafka consumers above partition count for a consumer group.

## Locked Decisions

1. Capacity is source/cost-specific.
2. Background systems need explicit limits.
3. Load tests must include worker queues, not only REST API.
4. Worker scaling considers queue lag and external quotas.
5. AI capacity planning includes cost and schema validity, not only latency.

