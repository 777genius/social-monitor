# Iteration 00 - First Sprint Ticket Cut

## Sprint Objective
Lock the product loop, domain map, source policy and architecture rules so implementation can start without hidden assumptions.

## Ticket 1 - Product Loop And Glossary
- Define core user journey from workspace to delivered summary.
- Name core terms: tenant, workspace, topic, source binding, scan policy, feed item, summary, delivery.
- Acceptance: every later iteration can reference the same vocabulary.
- Edge cases: personal-use wording must not remove multi-tenant requirements.

## Ticket 2 - Bounded Context Map
- Draw contexts for identity, subscription/topic, ingestion, feed, summarization, delivery and operations.
- Define ownership and allowed cross-context communication.
- Acceptance: no context owns another context's persistence model.
- Edge cases: shared concepts must be value objects or contracts, not shared mutable entities.

## Ticket 3 - Source Acquisition Policy
- Define official/open/provider-first acquisition strategy.
- Add risk classes, allowed MVP sources and production blockers.
- Acceptance: each source adapter can be approved or rejected by policy.
- Edge cases: do not approve high-risk browser/bypass scraping as a production path.

## Ticket 4 - Contract And Event Standards
- Define REST/OpenAPI, event and internal RPC naming/versioning rules.
- Define idempotency, tenant scope and schema ownership requirements.
- Acceptance: Iteration 01 can scaffold contracts without inventing rules.
- Edge cases: contract examples must include failure and backwards compatibility cases.

## No-Go Criteria
- Source policy is missing.
- Domain boundaries are disputed.
- Contract standards are not reviewed.
