# Iteration 07 - Edge Case Playbook

## Scenario - User Requests Unsupported Source

- Signal: Beta feedback asks for X/Twitter or another unavailable source.
- Validate: Check source roadmap and production-safe access options.
- Mitigation: Record request, explain limitation, prioritize only with evidence.

## Scenario - Topic Is Too Vague

- Signal: Feed is broad and summary quality is poor.
- Validate: Review topic rules and source binding.
- Mitigation: Improve onboarding examples and feedback taxonomy.

## Scenario - Provider Quota Exhausted During Onboarding

- Signal: First scan fails with quota/rate-limit state.
- Validate: Quota dashboard and source status.
- Mitigation: Pause binding, show clear status, adjust beta quotas.

## Scenario - Support Cannot Diagnose Failure

- Signal: Support needs developer shell access.
- Validate: Run support drill.
- Mitigation: Add dashboard/runbook entry before expanding beta.

## Scenario - Beta Ring Expansion With Open Blocker

- Signal: team wants more users while cross-tenant, secret, citation, cursor/idempotency or cost blocker remains.
- Validate: go/no-go checklist and blocker register.
- Mitigation: hold expansion, assign owner and re-run blocker evidence after fix.

## Scenario - Launch Paused While Jobs Are Queued

- Signal: beta must pause but scans/summaries/digests are already queued.
- Validate: pause-source/tenant drill with queued work.
- Mitigation: disable new work, let safe jobs finish or cancel by policy, surface status to users/support.

## Scenario - Known Limitation Hidden From User

- Signal: user hits unsupported source/feature and perceives it as broken.
- Validate: onboarding/source setup/known limitations review.
- Mitigation: make limitation explicit with reason, workaround and revisit trigger.

## Scenario - Summary Useful But Too Late

- Signal: feedback says summary quality is acceptable but freshness misses user need.
- Validate: scan freshness, summary queue latency and user workflow timing.
- Mitigation: tune scan/summary schedule within quota or classify as roadmap opportunity.

## Scenario - Unsupported Source Has Strong Demand

- Signal: multiple beta users request same source.
- Validate: request count, use case value, safe access path, cost and adapter feasibility.
- Mitigation: create source readiness ADR; do not implement until approved path and certification fixtures exist.
