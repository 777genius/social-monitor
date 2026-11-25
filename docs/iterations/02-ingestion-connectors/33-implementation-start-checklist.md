# Iteration 02 - Implementation Start Checklist

## Prerequisites

1. Platform skeleton builds.
2. Outbox/idempotency exist.
3. Tenant-scoped topic/source binding exists.
4. Source acquisition policy is accepted.

## Locked Before Work

1. Connector SDK comes before real adapters.
2. HN/RSS are first production-safe sources.
3. Certification tests are mandatory.
4. Provenance is mandatory for feed items.

## First Tickets

1. Define SourceProviderPort.
2. Define capability profile.
3. Build certification tests.
4. Implement HN/RSS adapters.

## No-Go Items

- Adding high-risk social source before SDK certification.
- Saving cursor before durable write.
- Feed without provenance.
