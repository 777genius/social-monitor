# 256 - Local Development Compose Policy

## Decision

Use Docker Compose for local infrastructure, not as the production runtime model.

Compose must make development reproducible while keeping production architecture decisions in Kubernetes/IaC documents.

## Sources

- Docker Compose services reference: https://docs.docker.com/reference/compose-file/services/
- Docker Compose profiles: https://docs.docker.com/reference/compose-file/profiles/
- Docker Compose startup order: https://docs.docker.com/compose/how-tos/startup-order/
- Docker Compose quickstart: https://docs.docker.com/compose/gettingstarted/

## Local Stack

Default local services:

- Postgres
- Redis
- RabbitMQ
- object-storage compatible service
- API service
- worker service

Optional profiles:

- Kafka
- OpenSearch
- observability stack
- mail/webhook catcher
- AI mock service
- contract test broker

## Profiles

Use Compose profiles so heavy dependencies do not run by default.

Example profile names:

```text
core
streaming
search
observability
contracts
e2e
```

Services without a profile should be minimal and broadly needed.

## Healthchecks

Compose startup order must use healthchecks for dependencies where supported.

`depends_on` alone is not enough for readiness; Docker documents `service_healthy` as the condition for waiting on healthchecks.

Required healthchecks:

- Postgres accepts connections
- Redis ping
- RabbitMQ management/health endpoint
- object storage ready
- API `/healthz`
- worker readiness where meaningful

## Environment Files

Use local-only `.env` examples.

Never commit real provider credentials, production secrets or tenant tokens.

Local development may use:

- fake provider keys
- local OAuth mock
- AI mock
- seeded demo tenant

## Data Volumes

Local named volumes are allowed.

Developer scripts must support:

- reset local DB
- reset queues
- reset object storage
- seed deterministic data

Do not make tests depend on a developer's persistent local volume state.

## Ports

Use stable default ports for developer ergonomics, but document overrides.

Avoid port conflicts by allowing environment override variables.

## Production Boundary

Compose files do not define:

- production scaling
- production secrets
- production network policies
- production backups
- production ingress
- production observability retention

Those belong to Kubernetes/IaC docs.

## Architecture Rule

Local Compose should make the right path easy.

It must not become a second, divergent production architecture.
