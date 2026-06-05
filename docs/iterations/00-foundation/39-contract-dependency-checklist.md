# Iteration 00 - Contract Dependency Checklist

## Purpose
Make the first contract dependencies explicit before platform implementation starts.

## Input Dependencies
- Product loop and glossary.
- Bounded context map.
- Source acquisition policy.
- Architecture guardrails.

## Output Contracts
- REST/OpenAPI standards.
- Event naming and versioning standards.
- Tenant and idempotency rules.
- Source provider policy contract.
- Problem Details error-code taxonomy.
- Compatibility policy for enums, statuses and optional fields.

## Owners
- Product owner owns user-facing vocabulary.
- Backend architecture owner owns service and event boundaries.
- Mobile owner owns client contract expectations.
- Source policy owner owns allowed acquisition paths.

## Breaking-Change Risks
- Renaming core concepts after scaffold begins.
- Changing tenant assumptions after persistence design.
- Allowing a source strategy that conflicts with adapter policy.
- Returning provider-specific errors through public API.
- Adding enum/status values without mobile fallback.
- Changing event envelope semantics without consumer compatibility review.

## Transition Readiness
- Iteration 01 can create API and event contracts from these rules.
- No implementation ticket needs to invent vocabulary.
- No source adapter can be accepted without policy classification.
- Mobile can map backend errors to typed recovery states.
- Workers can consume event envelopes without source-specific assumptions.
