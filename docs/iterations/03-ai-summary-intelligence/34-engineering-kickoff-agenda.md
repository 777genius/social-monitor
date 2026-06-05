# Iteration 03 - Engineering Kickoff Agenda

## Meeting Goal
Convert normalized feed data into cited, evaluated and cost-controlled summaries.

## Required Attendees
- AI/summarization lead.
- Backend lead.
- Product owner.
- QA/eval owner.
- Operations/cost owner.

## Agenda
1. Confirm summary formats and user-configurable rules.
2. Confirm evidence and citation requirements.
3. Confirm AI provider port and fallback model strategy.
4. Confirm structured output validation.
5. Confirm eval dataset, quality gates and cost telemetry.

## Decisions To Lock
- Citation strictness for beta summaries.
- Default model/profile for MVP.
- Summary policy fields.
- Regeneration and failure behavior.

## Edge Cases To Discuss
- Model produces plausible but uncited claims.
- Source evidence conflicts across items.
- Token budget is exceeded by noisy feeds.
- Provider outage happens during scheduled summaries.

## First-Day Output
- SummaryPolicy ticket is ready.
- Evidence model is accepted.
- Eval harness owner is assigned.
- Cost telemetry is part of acceptance.
