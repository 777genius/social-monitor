# Iteration 07 - Developer Execution Playbook

## Reading Order
1. Read `01-beta-scope-freeze.md`.
2. Read `35-first-sprint-ticket-cut.md`.
3. Read `39-contract-dependency-checklist.md`.
4. Read `42-release-gate-and-promotion.md`.
5. Read `43-production-readiness-gap-analysis.md`.

## PR Slicing
- PR 1: beta scope freeze.
- PR 2: known limitations.
- PR 3: onboarding checklist and walkthrough.
- PR 4: launch and rollback checklist.
- PR 5: feedback taxonomy and metrics.
- PR 6: post-beta roadmap synthesis.

## Checks Before PR
- Supported source list is frozen or change-controlled.
- Known limitations are concrete.
- Rollback trigger has owner.
- Feedback has category, severity and evidence.
- Unsupported source requests go to backlog, not implementation.

## Evidence To Attach
- Scope freeze approval.
- Updated known limitations/onboarding/support artifact.
- Rollback or pause trigger owner.
- Feedback taxonomy sample.
- Post-beta roadmap entry with demand, risk and cost classification.

## Architecture Guardrails
- Beta validates the loop, it does not bypass source policy.
- Roadmap items need demand, risk and cost classification.
- Post-MVP work must reuse ports/adapters and bounded contexts.

## Escalate When
- Launch cannot be paused safely.
- Users cannot complete onboarding.
- Feedback suggests architecture guardrail changes.
