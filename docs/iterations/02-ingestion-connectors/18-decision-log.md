# Iteration 02 - Decision Log

## Decision 001 - HN/RSS First

- Decision: Implement Hacker News and RSS before higher-risk social sources.
- Alternatives: Start with X/Twitter or Reddit immediately.
- Rationale: HN/RSS validate ingestion, scheduling, dedupe and summaries with lower access risk.
- Consequences: MVP proves platform mechanics before expensive/fragile connectors.
- Revisit When: Connector SDK passes certification and provider-safe access is ready.

## Decision 002 - Certification Tests For Every Connector

- Decision: Every connector must pass shared certification tests.
- Alternatives: Test each adapter ad hoc.
- Rationale: Replaceable adapters require consistent behavior for errors, cursors and dedupe.
- Consequences: More test infrastructure, safer source expansion.
- Revisit When: Source capabilities become too different for one certification profile.
