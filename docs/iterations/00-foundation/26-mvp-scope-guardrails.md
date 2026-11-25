# Iteration 00 - MVP Scope Guardrails

## In Scope

1. Define the end-to-end MVP loop.
2. Define bounded contexts and ownership.
3. Define architecture standards.
4. Define contract standards.
5. Define source acquisition safety.

## Out Of Scope

1. Implementing production code.
2. Adding every future social source.
3. Designing enterprise billing in detail.
4. Building scraping/bypass strategy.

## Scope Creep Signals

- A decision does not improve workspace -> topic -> source -> scan -> feed -> summary -> delivery.
- A source is added without approved acquisition class.
- A context is added without aggregate ownership.

## Decision Rule

Accept only foundation work that reduces rewrite risk for the MVP loop.

## Complexity Budget

- Build deeply: product loop, glossary, bounded contexts, source policy and contract rules.
- Define lightly: future source roadmap, future billing shape and service extraction criteria.
- Defer: production code, enterprise billing, broad source commitments and detailed compliance programs.

## MVP Architecture Cutline

Build now:

1. Bounded context ownership and aggregate invariants.
2. Ports/adapters and import-boundary rules.
3. REST/event contract conventions.
4. Source readiness categories and capability profile shape.
5. Service extraction readiness criteria.

Define as extension points:

1. gRPC internals.
2. Physical microservice split.
3. Additional social source adapters.
4. Provider fallback marketplace.
5. Enterprise billing/compliance workflows.

Defer:

1. Separate runtime for every bounded context.
2. Complex saga framework.
3. Broad analytics dashboards.
4. Multi-region operations.
5. Full compliance certification.

## Stop Or Simplify If

- A proposed artifact cannot map to a phase ticket, test, ADR or gate.
- A new service adds runtime operations but no measured scaling/reliability/security value.
- A generic abstraction hides source-specific behavior that still needs separate tests.
- A mobile or backend feature duplicates domain rules in a second layer.
- A future-source plan starts driving MVP database or domain shape before an approved acquisition path exists.
