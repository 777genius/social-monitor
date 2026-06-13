# Iteration 07 - First Sprint Ticket Cut

## Sprint Objective
Freeze beta scope, prepare onboarding/support, run launch checks and create a feedback-to-roadmap loop.

## Ticket 1 - Beta Scope Freeze
- Define supported sources, features, limits and known exclusions.
- Acceptance: team has a single document for what beta does and does not include.
- Edge cases: new source requests during launch are tracked, not accepted ad hoc.

## Ticket 2 - Known Limitations
- Publish limitations for scan cadence, source reliability, summary quality and notifications.
- Acceptance: beta users are not surprised by expected constraints.
- Edge cases: limitation wording must be concrete enough for support triage.

## Ticket 3 - Onboarding Checklist
- Define account setup, topic setup, source binding and first summary path.
- Acceptance: a new beta user can complete the core loop without engineering help, and backend evidence is covered by `npm run check:mvp-core-loop`.
- Edge cases: onboarding must cover failed source binding and empty feed.

## Ticket 4 - Launch And Rollback Checklist
- Define launch sequence, monitoring checks, rollback/pause triggers and owners.
- Acceptance: launch can be paused without confusion.
- Edge cases: partial launch failure, source outage and AI provider degradation.

## Ticket 5 - Feedback Taxonomy And Metrics
- Group feedback into source coverage, relevance, summary trust, UX, reliability and cost.
- Acceptance: post-beta roadmap decisions can cite evidence.
- Edge cases: anecdotal feedback must not override measured reliability without review.

## No-Go Criteria
- Supported source list is not frozen.
- Rollback trigger is unclear.
- Support triage path is missing.
