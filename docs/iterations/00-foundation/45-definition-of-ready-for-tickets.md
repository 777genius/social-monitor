# Iteration 00 - Definition Of Ready For Tickets

## Ready Goal
Ensure foundation tickets are precise enough to prevent architecture drift before code starts.

## Required Ticket Context
- Product loop segment affected.
- Bounded context or cross-context decision.
- Owner and reviewer.
- Source-policy impact, if any.
- Contract or vocabulary impact.

## Required Acceptance Checks
- Terms match glossary.
- Tenant/workspace assumptions are explicit.
- Source decisions have risk class.
- Contract decisions include versioning and idempotency impact.

## Required Edge Cases
- Personal-use shortcut affecting future tenancy.
- Source that is useful but policy-blocked.
- Term used differently by backend, mobile or product.

## Not Ready If
- Owner is missing.
- Decision changes future implementation but has no ADR/change note.
- Ticket can be interpreted as both product and infrastructure work.

## Ready Output
Ticket can be implemented or reviewed without inventing missing vocabulary, policy or contract rules.
