# Iteration 00 - Backlog Prioritization Matrix

## Prioritization Goal
Put foundation decisions that unblock all future implementation ahead of nice-to-have planning detail.

## P0 - Do First
- Product loop and glossary.
- Bounded context ownership.
- Source acquisition policy.
- Contract and event standards.

## P1 - Do After P0
- Ticket quality rules.
- ADR seeds.
- Review and closure gates.
- Cross-functional approval checklist.

## P2 - Defer If Needed
- Future source ranking.
- Advanced product variants.
- Detailed provider-specific limits before adapters exist.

## Prioritize Higher When
- Change affects multi-tenancy.
- Change affects source safety.
- Change affects contracts used by backend/mobile.
- Change can invalidate later architecture.

## Do Not Prioritize
- Cosmetic documentation polish before unresolved policy decisions.
- Source expansion detail before source policy.
- Implementation tooling choices before context and contract rules.
