# Iteration 06 - Estimation And Resourcing

## Relative Effort

- Complexity: High
- Risk: Very high if launched without it
- Recommended duration: 1-2 sprints

## Required Roles

- SRE/DevOps
- Security engineer
- Backend platform engineer
- QA/load testing owner
- Support owner

## Parallel Work

1. Tenant isolation and secret redaction first.
2. Metrics/dashboards can run with CI hardening.
3. Load/cost tests can run after quotas and core flows stabilize.

## Bottlenecks

- Missing metrics blocks support.
- Weak CI gates allow contract regressions.
- Unverified backup/restore blocks beta confidence.

## No-Cut Areas

- Tenant isolation.
- Secret redaction.
- Observability.
- CI contract/migration gates.
- Cost/quota controls.
- Backup/restore.
