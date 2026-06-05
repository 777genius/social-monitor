# Schema Registry Operations

Date: 2026-05-31
Status: baseline schema registry operations memory

## Decision

Schema Registry is production infrastructure, not just a developer convenience.

If Kafka events use schema IDs, Schema Registry availability and recovery matter.

References:

- Confluent Schema Registry: https://docs.confluent.io/platform/current/schema-registry/index.html
- Schema Registry concepts: https://docs.confluent.io/platform/current/schema-registry/fundamentals/index.html
- Schema Linking: https://docs.confluent.io/platform/current/schema-registry/schema-linking-cp.html
- Schema migration: https://docs.confluent.io/platform/7.4/schema-registry/installation/migrate.html

## Required Operations

Track:

```text
schema subjects
compatibility mode
schema owners
producer services
consumer services
latest version
deprecated versions
```

## Compatibility Policy

Default:

```text
BACKWARD_TRANSITIVE for critical events
BACKWARD for less critical internal events
```

Any breaking schema requires:

- new event version;
- dual-publish/dual-consume window if needed;
- migration note;
- deprecation plan.

## Backup/DR

Schema Registry needs:

- backup/export plan;
- migration plan;
- restore test;
- environment separation;
- access control.

If using managed schema registry, document provider backup/DR guarantees.

## CI/CD

CI must:

- validate schema compatibility;
- generate DTOs where applicable;
- block breaking changes without migration;
- publish schema docs.

## Locked Decisions

1. Schema Registry is production dependency.
2. Schema compatibility is checked in CI.
3. Critical events use stricter compatibility.
4. Schema Registry needs backup/migration plan.
5. Breaking schemas require event versioning and migration plan.

