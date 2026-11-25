# 101. Bounded Context Map

## Status

Locked for architecture baseline.

## Research Anchors

- NestJS microservices basics: https://docs.nestjs.com/microservices/basics
- NestJS gRPC transport: https://docs.nestjs.com/microservices/grpc

## Decision

Model the backend as bounded contexts first. Deployment units may start coarse, but code ownership and dependency direction must be strict from day one.

## Initial Contexts

| Context | Owns | Does Not Own |
|---|---|---|
| Identity & Tenancy | tenants, users, memberships, roles | billing plans, source credentials |
| Entitlements & Billing | plans, limits, usage counters, invoices integration | scheduler decisions |
| Topic Management | topics, rules, summary preferences | source fetch implementation |
| Source Management | source bindings, credentials refs, provider capabilities | normalized content ownership |
| Scheduling | scan policies, due work, fairness, backpressure | provider credentials secrets |
| Ingestion | fetch jobs, cursors, raw payload refs, normalization | summaries, notifications |
| Content Intelligence | relevance, dedupe, clustering, summaries, translation | source credentials |
| Feed & Search | read models, saved views, item retrieval | source fetching |
| Notifications | digests, alerts, channels, delivery state | topic rule editing |
| Audit & Compliance | audit events, deletion workflows, export state | business decisions |
| Admin & Support | support workflows, impersonation approvals | direct data mutation outside audited commands |

## Dependency Rules

- Contexts call other contexts through application ports, REST/gRPC contracts or events.
- Domain entities do not import infrastructure adapters.
- Cross-context database joins are forbidden in application code.
- Shared kernel is tiny: ids, time, money, pagination, result/error primitives.
- Avoid a shared "common" module for business concepts.

## Context Integration

| Need | Integration |
|---|---|
| synchronous command/query | REST externally, gRPC internally |
| durable state transition | Kafka event |
| retryable work | RabbitMQ job |
| read model update | Kafka consumer + idempotent projection |
| long workflow | orchestrator/saga, not ad hoc callback chains |

## Best-Fact Choice

The strongest path is a modular monorepo with hard context boundaries before aggressive service splitting. This keeps microservice options open without paying full distributed-system cost too early.

