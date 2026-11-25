# Platform Architecture

## Monorepo Shape

Use pnpm workspaces + Nx for orchestration, with NestJS apps/libs inside the monorepo.

```text
apps/
  api-gateway/
  worker-ingestion/
  worker-intelligence/
  worker-notifications/
  realtime-gateway/

packages/
  platform-contracts/
  platform-config/
  platform-observability/
  platform-security/
  platform-messaging/
  platform-persistence/
  platform-errors/
  platform-idempotency/
  platform-rate-limits/
  source-connector-sdk/
  summary-model-sdk/
  delivery-provider-sdk/
```

Start with 4-5 deployables. Keep code boundaries strict so later service extraction is mechanical.

References:

- NestJS monorepo: https://docs.nestjs.com/cli/monorepo
- Nx NestJS plugin: https://nx.dev/docs/technologies/node/nest/introduction
- NestJS microservices: https://docs.nestjs.com/microservices/basics/

## Bounded Contexts

```text
Identity & Tenancy
Subscriptions
Scheduling
Ingestion
Normalization
Dedupe & Relevance
Summarization
Digest & Delivery
Compliance & Retention
Observability & Operations
Cost Governance
```

Each service/module follows:

```text
domain/
features/
ports/
adapters/
interfaces/
```

Feature slices hold application/use-case behavior. Ports live at the context level, not inside `domain`. Adapters implement ports, and interfaces map REST/jobs/events/WS to feature use cases.

## Communication

```text
Flutter/Web -> REST/OpenAPI -> api-gateway
Flutter/Web -> WebSocket -> realtime-gateway
api-gateway -> gRPC -> internal services
services -> Kafka -> durable events
workers -> RabbitMQ -> task queues
```

Kafka is for durable event streams, replay and fan-out. RabbitMQ is for task dispatch, retries and DLQs.

References:

- Kafka design: https://kafka.apache.org/42/design/design/
- RabbitMQ queues: https://www.rabbitmq.com/docs/queues
- RabbitMQ quorum queues: https://www.rabbitmq.com/docs/4.2/quorum-queues

## Contract Strategy

Use:

- OpenAPI 3.1 for REST.
- RFC 9457 Problem Details for errors.
- AsyncAPI + CloudEvents envelope for events.
- Schema Registry with Protobuf or JSON Schema for Kafka payloads.
- Protobuf/gRPC for internal sync calls.
- JSON Schema / Structured Outputs for AI output.
- Buf for protobuf linting and breaking-change detection.

References:

- JSON Schema 2020-12: https://json-schema.org/draft/2020-12
- RFC 9457: https://www.rfc-editor.org/rfc/rfc9457
- CloudEvents: https://github.com/cloudevents/spec
- AsyncAPI: https://www.asyncapi.com/en
- Buf breaking changes: https://buf.build/docs/breaking/

## Idempotency & Outbox

Never dual-write DB + Kafka directly.

Required:

- transactional outbox;
- inbox/processed-message table;
- deterministic idempotency keys;
- idempotent consumers;
- bounded retries;
- dead-letter topics/queues.

Example idempotency keys:

```text
source_item:{source}:{external_item_id}
connector_run:{subscription_id}:{source}:{window_start}:{window_end}
summary:{tenant_id}:{cluster_id}:{summary_rule_version}
digest:{tenant_id}:{digest_schedule_id}:{period_start}
```

Reference:

- Debezium Outbox Event Router: https://debezium.io/documentation/reference/2.6/transformations/outbox-event-router.html
