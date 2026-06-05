# Iteration 02 - Scope Change Decision Tree

## Decision Goal
Prevent source expansion from destabilizing normalized feed and connector reliability.

## Accept Now If
- Change improves SourceProviderPort without breaking adapters.
- Change strengthens certification tests.
- Change fixes cursor, retry or provenance reliability.

## Defer If
- Change adds Reddit, X/Twitter or Telegram before HN/RSS certification is stable.
- Change adds source ranking beyond MVP ingestion.
- Change adds advanced dashboards that are not needed for summary readiness.

## Escalate To ADR If
- Change alters normalized feed schema.
- Change changes source policy classification.
- Change changes scheduler/cursor semantics.

## Block If
- Change requires provider-specific downstream fields.
- Change treats unsupported acquisition path as production-ready.
- Change advances cursor before durable persistence.

## Required Record
- Source policy status.
- Capability profile impact.
- Certification impact.
- Downstream contract impact.
