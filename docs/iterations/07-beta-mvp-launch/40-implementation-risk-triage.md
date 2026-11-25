# Iteration 07 - Implementation Risk Triage

## Triage Goal
Detect launch risks before beta scope expands or users encounter unsupported behavior.

## Critical Risks
- Beta adds new sources during launch without review.
- Rollback/pause trigger is unclear.
- Support triage depends on engineering guesswork.
- Feedback is converted into roadmap without evidence classification.

## Early Warning Signals
- Source requests are handled in chat instead of backlog.
- Known limitations are missing from onboarding.
- Metrics and qualitative feedback disagree without review.
- Launch checklist has unnamed owners.

## Owners
- Product owner owns beta scope and feedback taxonomy.
- Engineering lead owns technical go/no-go.
- Support owner owns triage process.
- Operations owner owns launch and rollback evidence.

## Mitigations
- Freeze source list before launch.
- Publish known limitations before onboarding.
- Require owner for every rollback trigger.
- Convert feedback into demand/risk/cost-classified backlog items.

## Stop-Work Triggers
- Unsupported source is added during beta launch.
- Launch cannot be paused safely.
- Critical feedback has no owner or classification.

## MVP Risk Cutline
- Fix now: onboarding failure, rollback ambiguity, unsupported source scope and unowned critical feedback.
- Carry with owner: non-critical roadmap uncertainty.
- Defer: broad public launch, enterprise onboarding and source expansion without evidence.
