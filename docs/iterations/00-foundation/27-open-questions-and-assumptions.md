# Iteration 00 - Open Questions And Assumptions

## Working Assumptions

1. MVP is personal-use first but must be multi-tenant by architecture.
2. Source ingestion must be production-safe and adapter-based.
3. HN/RSS are enough to validate the first ingestion loop.
4. X/Twitter, Reddit and Telegram require separate source readiness decisions.

## Open Questions

| Question | Owner | Deadline | Decision Impact |
| --- | --- | --- | --- |
| Which sources are explicitly MVP vs roadmap? | Product | Before Iteration 02 | Connector scope |
| Which tenant/workspace roles exist in MVP? | Backend architect | Before Iteration 01 | Auth and data model |
| Which summary rule fields are required first? | Product/AI | Before Iteration 03 | Summary policy |
| Which Flutter platforms are first-class for beta? | Mobile owner | Before Iteration 04 | Release target |

## Validation Rule

No assumption can become implementation scope unless it maps to the MVP loop and has an owner.
