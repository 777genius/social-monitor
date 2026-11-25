# Iteration 00 - Implementation Risk Triage

## Triage Goal
Detect foundation risks before they turn into implementation churn.

## Critical Risks
- Source policy is vague, allowing unsafe production assumptions.
- Multi-tenancy is postponed because MVP starts personal-use.
- Bounded contexts are named but not owned.
- Contract standards are too abstract to guide tickets.

## Early Warning Signals
- Tickets use different names for the same concept.
- Source discussions focus on bypass mechanics instead of approved acquisition paths.
- Teams ask whether tenant ID is needed in core flows.
- API/event examples omit failure and versioning behavior.

## Owners
- Product owner resolves vocabulary drift.
- Architecture owner resolves bounded-context disputes.
- Source policy owner resolves source-risk classification.
- Contract owner resolves API/event ambiguity.

## Mitigations
- Freeze glossary before platform scaffold.
- Require source risk class before adapter planning.
- Add tenant scope to every core use-case example.
- Convert contract rules into example DTOs/events.

## Stop-Work Triggers
- A source is approved without policy review.
- Implementation starts without bounded-context owner.
- Contract rules cannot answer a real ticket question.

## MVP Risk Cutline
- Fix now: risks that make later platform structure ambiguous.
- Carry with owner: provider-specific limits that need adapter research.
- Defer: source ranking debates that do not change HN/RSS/fake MVP path.
