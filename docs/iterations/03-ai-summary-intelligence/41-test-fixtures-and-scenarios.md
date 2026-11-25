# Iteration 03 - Test Fixtures And Scenarios

## Purpose
Define summary fixtures that prove citations, validation, evals and cost tracking.

## Core Fixtures
- Feed cluster with consistent evidence.
- Feed cluster with contradictory evidence.
- Feed items with duplicate content and different sources.
- Valid structured summary output.
- Malformed provider output.
- Provider output with uncited claim.
- Provider output with valid schema but invalid citation ids.
- Source item containing prompt-injection text.
- Source binding that disallows AI summarization.
- Long evidence window that exceeds token budget.
- Summary policy requesting unsupported language or format.
- Feedback record marking wrong fact and bad citation.

## Happy Path Scenarios
- Summary policy validates.
- Summary is generated with citations to feed item IDs.
- Structured output passes schema and business validation.
- Usage and cost telemetry are recorded.
- No-signal artifact is created for empty relevant window.
- Stale marker is added when newer feed evidence arrives after source window.

## Negative Scenarios
- Model returns malformed JSON.
- Model cites missing feed item.
- Summary contains uncited claim.
- Provider times out or refuses request.
- Model cites item from another tenant/topic.
- Prompt-injection source text alters output instructions.
- Cost preflight rejects request before provider call.
- Repair attempt returns valid JSON but invalid citations.

## Edge Cases
- Token budget exceeded.
- Evidence is stale or deleted.
- User asks for unsupported summary format.
- Two sources disagree on the same fact.
- User regenerates while same request is already running.
- Feedback is submitted after summary is superseded.
- Source item retention removes raw body but citation metadata remains.
- Provider returns output in wrong language.

## Regression Seeds
- Golden eval dataset.
- Citation validation examples.
- Cost telemetry snapshot.
- Prompt-injection dataset.
- No-signal/conflicting-evidence dataset.
- Feedback-derived eval fixture pack.
