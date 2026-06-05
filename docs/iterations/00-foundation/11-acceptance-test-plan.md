# Iteration 00 - Acceptance Test Plan

## Acceptance Scenarios

1. Given a future implementation ticket, it can be mapped to one bounded context, one layer and one primary artifact.
2. Given a new source request, the team can classify it as official API, open API, RSS, licensed provider, export/import, manual research capture or rejected.
3. Given a proposed domain entity, reviewers can verify it has no dependency on NestJS, ORM, broker or provider payloads.
4. Given a cross-context workflow, communication is modeled as API call or domain event.
5. Given a Flutter feature proposal, it maps to feature-scoped Clean Architecture layers.

## Negative Scenarios

1. Reject a connector proposal that depends on bot-detection bypass or unmanaged browser automation.
2. Reject a domain model that imports infrastructure types.
3. Reject a ticket that lacks contract impact and tests required.
4. Reject a summary workflow that cannot cite source evidence.

## Regression Checks

- Context map still covers the full MVP loop.
- Source acquisition policy still blocks unsafe production scraping.
- Contract versioning rules cover REST, events and gRPC.
- Architecture guardrails cover backend and Flutter.

## Pass Criteria

Foundation is accepted when reviewers can use the documents to create implementation tickets without adding new architectural assumptions.
