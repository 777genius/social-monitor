# Iteration 00 - Role-Based Execution Plan

## Product Owner

- Define MVP loop.
- Separate personal-use MVP from future multi-user platform.
- Freeze non-goals for first build.

## Backend Architect

- Own bounded context map.
- Define aggregate ownership.
- Define REST/event/gRPC contract rules.

## Mobile Architect

- Map bounded contexts to Flutter feature scopes.
- Define MobX store boundaries.
- Define generated client boundary.

## Source/Ingestion Owner

- Define source risk classes.
- Define allowed and rejected acquisition modes.
- Define connector readiness requirements.

## SRE/Security

- Review multi-tenant assumptions.
- Review source safety policy.
- Define early security/ops constraints.

## Handoffs

- Product loop -> all lanes.
- Context map -> backend/mobile.
- Source policy -> ingestion.
- Contract rules -> platform/API/event owners.
