# Iteration 03 - Anti-Patterns And Forbidden Shortcuts

## Purpose
Prevent AI work from producing fluent but untrusted summaries.

## Forbidden Shortcuts
- Showing uncited generated text as final summary.
- Persisting provider output without schema and business validation.
- Changing prompts without eval path.
- Hiding cost and usage metadata.

## Architecture Anti-Patterns
- Provider SDK types in domain/application code.
- SummaryPolicy implemented as only a prompt string.
- Citation validation duplicated across API and mobile.

## Product Anti-Patterns
- Treating summary quality as subjective only.
- Prioritizing format variety over trust.
- Hiding AI failure states from users.

## Stop Immediately If
- Final summary can contain uncited claims.
- Provider-specific schema leaks into public API.
- Cost cannot be attributed to tenant/topic/job.
