# Iteration 07 - Acceptance Test Plan

## Acceptance Scenarios

1. New beta user completes onboarding.
2. User creates topic and binds supported source.
3. Scheduled scan produces feed items.
4. Summary appears with citations.
5. Realtime status updates are visible.
6. User submits feedback.
7. Support can diagnose a failed scan from dashboard/runbook.
8. Known limitations are visible in beta docs.
9. Beta metrics capture activation, scan success, summary usefulness and source requests.
10. Rollback checklist is executable.

## Negative Scenarios

1. User requests unsupported source.
2. Provider quota is exhausted during onboarding.
3. Topic is too vague and summary quality is poor.
4. Mobile/backend version mismatch is detected.
5. User exceeds beta quota.

## Regression Checks

- No beta workflow depends on unapproved source adapter.
- Support workflow maps failures to source/topic/summary context.
- Feedback taxonomy captures product and source expansion signals.
- Launch checklist remains tied to production hardening gates.

## Pass Criteria

Beta launch is accepted when real users complete the full loop and feedback produces evidence for next-source and product priorities.
