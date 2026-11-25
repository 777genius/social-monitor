# Iteration 07 - Test Fixtures And Scenarios

## Purpose
Define beta launch fixtures that prove onboarding, support, rollback and feedback loops.

## Core Fixtures
- Beta user with no topics.
- Beta user with supported source binding.
- Unsupported source request.
- Known limitation example.
- Feedback item with category, severity and evidence.
- Fresh tenant E2E fixture.
- Beta blocker register.
- Launch evidence bundle.
- Support intake record with correlation id.
- Source expansion request with access/cost/risk fields.

## Happy Path Scenarios
- Beta user completes onboarding.
- User creates topic, binds source, receives feed and summary.
- Support triages known limitation.
- Feedback is classified into roadmap category.
- Ring expansion decision records go/hold/rework with evidence.
- Post-beta report maps feedback to roadmap decisions.

## Negative Scenarios
- Supported source fails during launch.
- User requests unsupported source.
- Rollback trigger fires.
- Feedback lacks evidence or owner.
- Known limitation is not visible in onboarding/source setup.
- Launch evidence bundle misses security or summary eval evidence.
- Beta blocker remains open during expansion request.

## Edge Cases
- Metrics look healthy but trust feedback is negative.
- Launch pauses while scans are queued.
- User misunderstands known limitation.
- Source coverage demand conflicts with reliability risk.
- Summary quality is good but too late.
- Source demand is high but access path is unsafe.
- User asks for team workflow before RBAC is ready.

## Regression Seeds
- Onboarding walkthrough.
- Launch/rollback checklist fixture.
- Feedback taxonomy examples.
- Go/no-go decision record examples.
- Known limitation copy examples.
- Source readiness request examples.
