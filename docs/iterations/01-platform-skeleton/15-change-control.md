# Iteration 01 - Change Control

## Change Types

| Change | Requires Review | Required Evidence |
| --- | --- | --- |
| New NestJS app | Architecture/platform owner | Bounded context and deployment rationale |
| New shared lib | Architecture owner | Layer/context ownership |
| Migration change | Data owner | Up/down strategy and clean DB test |
| REST contract change | API/mobile owners | OpenAPI diff |
| Event envelope change | Event owner | Consumer compatibility |
| Physical service extraction | Architecture/SRE owners | Stable contracts, scaling/reliability evidence, rollback plan |
| gRPC contract introduction | Architecture/API owners | Latency need, proto versioning, generated client checks |
| Broker responsibility change | Platform/SRE owners | Kafka/RabbitMQ ADR, retry/replay/dead-letter impact |

## Approval Rules

1. Do not add shared libs without explicit owner.
2. Do not change migrations without clean database validation.
3. Do not change REST DTOs without regenerating OpenAPI.
4. Do not change event envelope without compatibility review.
5. Do not physically split a service without runtime evidence and rollback plan.
6. Do not introduce gRPC without generated-contract ownership and consumer tests.
7. Do not move behavior between Kafka and RabbitMQ without an ADR.
8. Use change notes for local tooling tweaks that do not affect architecture, contracts, schema or runtime behavior.

## Rollback

- Prefer additive migrations.
- Revert breaking REST changes before mobile depends on them.
- Keep infra changes isolated to local environment until stable.
- Keep extracted services disableable or revertable during MVP hardening.
- Keep old event/queue consumers compatible until replacement is proven.

## Audit Notes

Record changed contracts, migrations and affected services in the iteration notes.

## Lightweight MVP Rule

Prefer one clear ADR for each platform-shaping decision over many low-value ADRs for implementation mechanics.
