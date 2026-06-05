# Iteration 00 - Quality Gates And Risk Register

## Hard Gates

1. Product loop is documented end to end.
2. Bounded contexts have clear ownership.
3. Aggregate roots and invariants are named.
4. Source acquisition policy is explicit and production-safe.
5. Clean Architecture dependency rules are written.
6. REST, event and gRPC contract versioning rules are written.
7. Ticket quality rule is accepted before implementation starts.

## Architecture Checks

- Domain language is not tied to NestJS, database tables or provider payloads.
- Each context owns its writes.
- Cross-context communication is modeled as API calls or events.
- Source connector strategy rejects unsafe production scraping.
- Future multi-tenant requirements are part of the domain model.

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| MVP scope expands into too many social networks | Delays core platform | Start with HN/RSS and provider-ready adapter model. |
| Microservices are split before context stability | High operational overhead | Keep modular monorepo first; split deployment only after contracts stabilize. |
| Source acquisition policy is vague | Legal/reliability failures | Require capability profile and source risk class for every connector. |
| Summary rules are confused with topic rules | Bad UX and brittle domain | Keep `Topic` and `SummaryPolicy` separate. |
| Frontend architecture drifts from backend contexts | Slow feature delivery | Align Flutter features to backend bounded contexts. |

## Edge Cases To Recheck

- One user belongs to multiple workspaces.
- Two tenants monitor the same public source.
- A source is technically reachable but not approved for production.
- A future source supports posts but not comments.
- A summary policy asks for impossible or unsafe output.

## Transition Criteria

Move to Iteration 01 only when the team can create a ticket that clearly states bounded context, layer, contract impact, events, tests and edge cases.
