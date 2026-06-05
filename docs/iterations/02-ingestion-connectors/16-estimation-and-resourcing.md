# Iteration 02 - Estimation And Resourcing

## Relative Effort

- Complexity: High
- Risk: Very high because ingestion quality drives summaries and trust
- Recommended duration: 2 sprints

## Required Roles

- Ingestion engineer
- Backend worker engineer
- Feed/data engineer
- Source policy reviewer
- QA engineer for fixtures and failure cases

## Parallel Work

1. Connector SDK and provider registry first.
2. HN and RSS adapters can run in parallel after SDK stabilizes.
3. Scheduler can run with feed schema once normalized item contract is stable.

## Bottlenecks

- Provider SDK churn blocks adapters.
- Normalized item schema churn blocks summary and mobile feed.
- Dedupe weakness creates downstream AI noise.

## No-Cut Areas

- Connector certification tests.
- Cursor discipline.
- Worker lease.
- Dedupe.
- Source provenance.
