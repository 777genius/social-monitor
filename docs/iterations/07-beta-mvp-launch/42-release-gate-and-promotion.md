# Iteration 07 - Release Gate And Promotion

## Promotion Goal
Approve movement from MVP beta into post-MVP roadmap execution.

## Required Evidence
- Beta scope freeze is respected.
- Supported source list is unchanged or change-controlled.
- Backend MVP core loop and feedback submission pass `npm run check:mvp-core-loop`.
- Launch and rollback checklist is executed.
- Support triage captures known limitations and incidents.
- Feedback is classified by demand, reliability, trust, UX, source risk and cost.

## Promotion Checks
- Beta validated the user-facing core loop and the backend core-loop/feedback gate is green.
- Unsupported source requests did not bypass policy.
- Roadmap items cite evidence.
- Residual risks have owners.

## Hold Conditions
- Launch cannot be paused safely.
- Feedback is anecdotal and unclassified.
- Source expansion is requested without risk/cost review.
- Users cannot complete onboarding reliably.

## Rollback Or Rework
- Pause beta if reliability or trust drops below gate.
- Rework onboarding if users cannot reach first summary.
- Rework roadmap if source demand conflicts with risk policy.

## Approval
Post-MVP work may start only when beta evidence is translated into reviewed backlog, ADRs and updated quality gates.
