# Iteration 00 - Phase To Ticket Map

| Phase | Ticket Groups | Key Artifacts | Closure Evidence |
| --- | --- | --- | --- |
| 01-product-domain-scope | Product loop, glossary, non-goals, source policy | MVP loop, source risk classes | Scope can be explained without new assumptions |
| 02-bounded-context-map | Context ownership, aggregate ownership, events | Context map, aggregate table | No ambiguous aggregate owner |
| 03-architecture-standards | Clean Architecture rules, Flutter rules, import rules | Guardrails, boundary rules | Tickets can name layer and boundary |
| 04-contract-first-planning | REST, events, gRPC, versioning | Contract standards | Compatibility rules are written |

## Ticket Cutting Rule

Each ticket must reference the phase, context, expected artifact and acceptance check.

## Traceability Rule

Before a ticket is ready, map it to `08-ticket-breakdown.md`, `11-acceptance-test-plan.md`, `14-traceability-matrix.md` and `59-traceable-evidence-register.md`. If the ticket cannot produce evidence, split or rewrite it.
