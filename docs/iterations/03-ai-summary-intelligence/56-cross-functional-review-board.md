# Iteration 03 - Cross-Functional Review Board

## Review Goal
Approve summary intelligence before mobile exposes generated insight to users.

## Required Reviewers
- AI lead.
- Backend lead.
- Product owner.
- Mobile lead.
- QA/eval owner.
- Operations/cost owner.

## Review Questions
- Are summaries cited and inspectable?
- Is provider output validated before persistence?
- Can mobile display trust and failure states?
- Are evals strong enough for prompt/model changes?
- Is cost attributable by tenant/topic/job?

## Required Evidence
- SummaryPolicy tests.
- Citation examples.
- Structured output validation results.
- Eval harness output.
- Cost telemetry sample.

## Approval Rule
Promote only if generated summaries are trustworthy enough for the MVP UI.
