# Iteration 03 - Decision Log

## Decision 001 - Cited Summaries Only

- Decision: User-visible summaries must cite normalized feed items.
- Alternatives: Fast uncited summaries.
- Rationale: Trust and auditability are core to social intelligence.
- Consequences: Requires evidence model and citation validation.
- Revisit When: Internal-only draft summaries are clearly separated from final output.

## Decision 002 - AI Provider Behind Port

- Decision: Keep model/provider implementation behind `AiSummarizerPort`.
- Alternatives: Call one provider directly from use cases.
- Rationale: Cost, quality and model availability will change.
- Consequences: More adapter work, easier provider/model replacement.
- Revisit When: Provider abstraction blocks required model capability.
