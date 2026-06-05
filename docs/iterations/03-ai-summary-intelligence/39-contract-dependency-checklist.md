# Iteration 03 - Contract Dependency Checklist

## Purpose
Make summary contracts stable enough for mobile display, realtime delivery and beta trust requirements.

## Input Dependencies
- Normalized feed item schema.
- Feed item provenance.
- Summary policy requirements.
- AI provider abstraction rules.

## Output Contracts
- SummaryPolicy schema.
- Evidence and citation schema.
- Summary status and failure contract.
- AI usage/cost telemetry contract.
- Summary-ready event.

## Owners
- AI lead owns summary policy and provider-port contracts.
- Backend lead owns summary APIs and events.
- Mobile owner validates citation and status display needs.
- Operations owner owns cost telemetry requirements.

## Breaking-Change Risks
- Citation shape changes after mobile implementation.
- Summary status meanings change after realtime integration.
- Cost metadata is omitted and later needed for quotas.
- Provider-specific model output leaks into public API.

## Transition Readiness
- Iteration 04 can show summaries, citations and failures without guessing.
- Iteration 05 can publish summary status events.
- Evals can detect contract-impacting prompt/model changes.
