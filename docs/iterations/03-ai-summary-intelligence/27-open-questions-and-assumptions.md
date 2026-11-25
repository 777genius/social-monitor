# Iteration 03 - Open Questions And Assumptions

## Working Assumptions

1. Final user-visible summaries require citations.
2. AI provider is replaceable behind a port.
3. Summary policy belongs to topic but is a separate aggregate/rule set.
4. Cost telemetry is MVP-critical.

## Open Questions

| Question | Owner | Deadline | Decision Impact |
| --- | --- | --- | --- |
| Which model/profile is default for beta? | AI/ops | Before provider adapter | Cost and quality |
| Which summary formats are MVP? | Product/AI | Before output schema | Mobile/API shape |
| How strict should citation validation be? | AI/feed owner | Before persistence | Summary trust |
| What feedback categories are first? | Product/mobile | Before feedback API | Learning loop |

## Validation Rule

Do not expose summaries in mobile until citation, schema validation and failure states are defined.
