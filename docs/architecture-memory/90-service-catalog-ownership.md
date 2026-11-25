# Service Catalog & Ownership

Date: 2026-05-31
Status: baseline ownership memory

## Decision

Every service, package, connector, queue, topic and major document must have an owner.

Start with markdown ownership. Add Backstage/service catalog later when the number of services/connectors makes discovery painful.

Reference:

- Backstage Software Catalog: https://backstage.io/docs/features/software-catalog/

## Owner Metadata

For each component:

```text
name
type
owner
lifecycle
description
runtime dependencies
contracts
dashboards
runbooks
source policy links
```

Component types:

```text
service
worker
package
connector
queue
topic
database_table_group
dashboard
runbook
doc
```

## Ownership Rules

- every Kafka topic has owner;
- every RabbitMQ queue has owner;
- every connector has owner;
- every high-risk package has owner;
- every runbook has owner;
- every source policy matrix row has owner.

## Later Backstage

Add Backstage when:

- many services/connectors exist;
- ownership is unclear;
- docs discovery is painful;
- service dependency graph matters to operations.

Do not add Backstage before it solves a real team/product problem.

## Locked Decisions

1. Ownership metadata is required.
2. Markdown ownership is enough for MVP.
3. Backstage is later, not MVP.
4. Topics/queues/connectors all need owners.
5. Runbooks and source policy rows need owners.

