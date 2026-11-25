# Iteration 04 - Estimation And Resourcing

## Relative Effort

- Complexity: High
- Risk: Medium-high because UX must expose operational states clearly
- Recommended duration: 2 sprints

## Required Roles

- Flutter engineer
- Mobile architect
- API contract owner
- Product/UX reviewer
- QA for offline/error states

## Parallel Work

1. App shell and generated client setup first.
2. Topic/source screens can run before summary UI.
3. Feed and summary screens can run in parallel after contracts stabilize.

## Bottlenecks

- OpenAPI drift blocks generated client.
- Missing backend failure states block honest UI.
- Headless component gaps can slow feature screens.

## No-Cut Areas

- Feature-scoped architecture.
- DTO mapping boundaries.
- Loading/empty/error/stale/offline states.
- Full MVP flow.
- Citation UI.
