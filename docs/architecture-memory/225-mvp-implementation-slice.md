# 225 - MVP Implementation Slice

## Decision

The first executable MVP must prove the architecture with the smallest useful vertical slice.

It should not start by implementing every requested source or every microservice split.

## MVP Goal

One tenant can:

1. create a topic
2. attach Hacker News and RSS sources
3. define a scan interval
4. run scheduled scans
5. normalize items
6. dedupe by URL/item id
7. generate a summary
8. view feed and summary in Flutter
9. receive realtime status update

This proves the product core without X/Reddit/Telegram cost and policy friction.

## Backend Slice

Initial deployables:

- `api-service`
- `worker-service`
- `ai-service` or AI adapter module inside worker until split is justified

Initial infrastructure:

- Postgres
- Redis
- RabbitMQ
- object storage-compatible bucket
- OpenAPI generation

Kafka can be introduced when durable cross-service event streams become necessary. Architecture keeps event contracts ready, but MVP does not need full Kafka operations on day one.

## Bounded Contexts In MVP

Required:

- Identity/Tenant minimal
- Topic Management
- Source Binding
- Scheduling
- Ingestion
- Normalized Feed
- Summary
- Realtime Status

Deferred:

- billing
- enterprise SSO
- multi-region
- advanced analytics warehouse
- Telegram TDLib
- X paid integration
- large-scale historical replay

## Source Order

1. Hacker News official API
2. RSS/Atom
3. Reddit official API
4. X through provider abstraction
5. Telegram Bot API

This order minimizes early external friction while preserving future architecture.

## Frontend Slice

Flutter features:

- auth shell or local dev identity
- topic list/create
- source binding list/create
- scan status panel
- normalized feed list
- summary detail
- settings for scan interval

## Backend Management Slice

REST-backed MVP management surfaces:

- `POST /topics` creates a workspace-scoped monitoring topic.
- `GET /topics` lists workspace topics with opaque cursor pagination.
- `POST /topics/:topicId/source-bindings` binds a production-safe source provider to a topic.
- `GET /topics/:topicId/source-bindings` lists source bindings with opaque cursor pagination and safe config previews; encrypted credential fields must expose only metadata, never ciphertext.
- `PATCH /topics/:topicId/source-bindings/:sourceBindingId/status` pauses or resumes scanning.
- `POST /source-bindings/:sourceBindingId/scan-policy` sets scan cadence.
- `GET /source-bindings/:sourceBindingId/scan-policy` returns current scan cadence and next run time.
- `POST /scan-requests` requests a manual scan within quota.
- `GET /scan-jobs/:scanJobId` returns scan status for resync.

Architecture:

- feature-scoped Clean Architecture
- MobX presentation stores
- generated REST client
- WebSocket status adapter
- `design_system` wrapper over `flutter_headless`

## Quality Gates

MVP is not accepted unless it has:

- OpenAPI spec generated
- at least one contract test for REST client/server shape
- source adapter fixture tests
- scheduler idempotency test
- outbox/inbox or job idempotency proof
- summary prompt fixture test
- Flutter store unit test for feed/status flow

## Non-Negotiables

Even in MVP:

- tenant id on all tenant-owned data
- source credentials encrypted
- raw payload separated from normalized item
- no provider-specific logic in domain
- idempotent ingestion
- explicit scan policy
- visible source health
- basic audit for source connection and summary generation

## What Not To Build First

Do not start with:

- Kubernetes complexity before local compose works
- full microservice explosion
- billing UI
- enterprise identity
- X paid connector
- Telegram client API
- OpenSearch cluster
- multi-region writes

## Success Criteria

MVP is successful when a new source adapter can be added without changing topic, summary, feed or Flutter domain models.

That is the architecture test.
