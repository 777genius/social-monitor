# Iteration 00 - Architecture Decision Record Seeds

## Purpose
List the foundation decisions that must become ADRs when they are accepted.

## ADR Seeds
- Choose production-safe source acquisition policy.
- Model multi-tenancy from the first MVP.
- Define bounded contexts for identity, topics, ingestion, feed, summaries and delivery.
- Define REST/OpenAPI as mobile-facing contract.
- Define versioned event envelope with tenant scope and idempotency.

## Alternatives To Capture
- Personal-only model first vs tenant-safe model first.
- Source-specific ingestion logic vs provider port/adapters.
- Contract-first examples vs implementation-generated contracts.

## Consequences To Record
- Early tenant modeling increases initial complexity but avoids migration rewrite.
- Source policy can block tempting shortcuts.
- Contract discipline slows early prototyping but protects mobile/backend parallel work.

## Revisit Triggers
- Beta users demand unsupported source coverage.
- Bounded context ownership becomes unclear.
- Contract rules block necessary implementation work.
