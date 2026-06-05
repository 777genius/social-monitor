# Iteration 00 - Architecture Compliance Audit

## Audit Goal
Verify that product and architecture foundations are strict enough to support DDD, Clean Architecture and future multi-user scale.

## Required Checks
- Bounded contexts have clear names, responsibilities and owners.
- Domain language is consistent across backend, mobile and documentation.
- Source acquisition policy separates production-safe adapters from unsupported risky paths.
- Multi-tenancy is treated as a core invariant, not a later migration.
- Contract standards include versioning, idempotency and tenant scope.

## Critical Violations
- A source strategy is approved without legal/ToS/risk classification.
- A personal MVP shortcut removes tenant boundaries.
- A context depends on another context's persistence model.
- Contracts are treated as implementation details instead of public boundaries.

## SOLID And Clean Architecture Focus
- Use cases must be described as application behavior, not controller behavior.
- Policy decisions must be independent of NestJS, Flutter, ORM or provider SDKs.
- Source providers must be modeled through ports before any adapter-specific plan.

## Evidence Required
- Context map.
- Source acquisition policy.
- Contract/event standard.
- Ticket quality rule.

## Closure Rule
Iteration 01 cannot start if core vocabulary, source policy or contract standards are still ambiguous.
