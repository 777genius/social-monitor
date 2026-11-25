# 229 - AI Summary Structured Output Pipeline

## Decision

Summary generation is schema-first.

The AI provider must return structured output that is validated before persistence and display.

## Sources

- OpenAI Structured Outputs guide: https://platform.openai.com/docs/guides/structured-outputs
- OpenAI Structured Outputs announcement: https://openai.com/index/introducing-structured-outputs-in-the-api/
- OpenAI prompt caching guide: https://platform.openai.com/docs/guides/prompt-caching
- OpenAI Batch API guide: https://platform.openai.com/docs/guides/batch
- OpenAI rate limits guide: https://platform.openai.com/docs/guides/rate-limits

## Summary Contract

Each summary result has a versioned schema:

```text
summary_schema_version
topic_id
source_window
executive_summary
key_points[]
notable_items[]
sentiment_or_tone
risks_or_uncertainties[]
citations[]
omitted_reason_counts
model_metadata
```

The schema is owned by the application layer and exposed in OpenAPI.

## Validation Pipeline

```text
candidate items
-> prompt assembly
-> model call with structured output
-> JSON schema validation
-> citation validation
-> policy/safety checks
-> persistence
-> summary.completed event
```

Invalid model output is not stored as a completed summary.

## Prompt Structure

Static prompt prefix:

- product role
- output schema instructions
- citation rules
- safety/policy constraints
- tenant summary style rules

Variable suffix:

- topic details
- source window
- candidate item excerpts
- user-specific summary preferences

This layout improves prompt-cache potential because static instructions remain at the beginning.

## Cost Controls

Use:

- item pre-filtering
- dedupe/clustering before summary
- token budget estimation
- prompt caching-friendly prefix
- model tier routing
- batch mode for non-urgent digest summaries
- cached summary reuse when source window did not materially change

Do not send every raw post/comment directly to an expensive model.

## Synchronous vs Batch

Synchronous:

- user opens topic and asks for fresh summary
- small source window
- interactive latency required

Batch:

- scheduled digests
- backfills
- large evaluation sets
- non-urgent tenant reports

Batch jobs must have their own status model because completion can be delayed.

## Citation Rule

Every claim in a summary must be traceable to source items.

Persist:

- source item ids
- source URLs/permalinks
- excerpt offsets where possible
- generated summary schema version
- prompt template version
- model id

## Provider Abstraction

```text
SummaryModelPort
  summarize(input, schema, budget, policy)
  estimateCost(input, modelClass)
  validateCapabilities(schema)
```

OpenAI is an adapter, not a domain dependency.

## Failure Classes

- model rate limited
- model unavailable
- schema unsupported
- unsafe/refusal response
- output validation failed
- context too large
- budget exceeded

Each maps to retry/degrade behavior.

## Architecture Rule

AI output is untrusted until validated.

The product stores structured summaries, not arbitrary assistant prose.
