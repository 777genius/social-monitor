# 102. Service Interface Contracts

## Status

Locked for architecture baseline.

## Research Anchors

- NestJS gRPC transport: https://docs.nestjs.com/microservices/grpc
- Protocol Buffers style guide: https://protobuf.dev/programming-guides/style/
- Protocol Buffers proto3 language guide: https://protobuf.dev/programming-guides/proto3/
- OpenAPI Specification: https://spec.openapis.org/oas/latest.html

## Decision

Define initial service interfaces before implementation. Every interface must name its caller class, sync/async expectation and compatibility policy.

## Public REST Surface

Initial REST resources:

- `/v1/tenants`
- `/v1/memberships`
- `/v1/interests`
- `/v1/source-bindings`
- `/v1/scan-policies`
- `/v1/feed-items`
- `/v1/summaries`
- `/v1/digests`
- `/v1/notification-channels`
- `/v1/usage`
- `/v1/audit-events`

Public REST is optimized for product workflows and generated clients, not internal service convenience.

## Internal gRPC Surface

Initial internal services:

| Service | Examples |
|---|---|
| EntitlementService | check limit, reserve usage, release reservation |
| SourceCapabilityService | capabilities, credential validation, quota state |
| SchedulerService | schedule topic, pause binding, enqueue due scan |
| IngestionService | start fetch, replay item, cursor state |
| IntelligenceService | score item, summarize cluster, translate artifact |
| NotificationService | enqueue digest, verify channel, delivery status |

## Protobuf Rules

- Use package names by bounded context.
- Use explicit request/response messages.
- Reserve deleted field numbers and names.
- Never expose database ids without typed naming.
- Do not use `Any` for core business contracts.
- Prefer repeated fields with pagination tokens for lists.

## Interface Ownership

Each interface has:

- owner context;
- compatibility level;
- generated client package;
- contract tests;
- deprecation policy.

## Best-Fact Choice

REST/OpenAPI should serve mobile/web/API consumers; gRPC should serve typed internal calls; Kafka/RabbitMQ should handle asynchronous state and work. Collapsing all communication into one style would make the system either brittle or inefficient.

