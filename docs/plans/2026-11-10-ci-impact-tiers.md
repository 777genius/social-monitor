# Social Monitor — PR CI impact tiers (2026-11-10)

## Goal and evidence
Reduce repeated GitHub Actions spend on narrowly scoped PRs without bypassing the existing 17 required `main` checks. Baseline: full `main` CI #42660523573 = 74.1 runner-minutes; draft #42701929090 = 12.1 runner-minutes. These are run-level observations, not guaranteed savings.

## Scope
1. Introduce **trusted-base**, fail-closed change classifier: `docs` / `frontend` / `full`.
2. Ordinary documentation (not used as a build/test contract) qualifies for `docs`: run existing Static architecture/quality and Security/public contracts; frontend/backend/production candidate lanes skip.
3. Isolated Flutter frontend files qualify for `frontend`: same checks + existing Flutter analysis, tests and release WASM build. No backend shard, migrations, native PostgreSQL or production candidate.
4. All other changes, unknowns, mixed files, root tooling, workflow, dependencies, APIs, Prisma, operations, release/security configuration, changed `AGENTS.md` and docs used as fixtures => `full`. `push`, `merge_group`, `workflow_dispatch` always full.
5. Preserve names of all required status checks, six-shard coverage and release/prod workflows. Reuse existing required `Backend build and unit tests` aggregating check to enforce *exact* expected success/skipped per tier on ready PRs; no check can be silently omitted. Draft PR policy stays as currently intended.
6. Do not move/rename `static_quality` or alter its exact trusted-root fixture setup: `check-release-gate-ci` contracts depend on it.
7. No production deploy, release, DB migrations, branch protection weakening or new dependencies.

## Security and merge criteria
- Classifier executed from PR **base** revision rather than PR merge/worktree source; never run untrusted test scripts in impact job. Fall back to `full` when base Git data or classifier is missing/untrusted. Use NUL-delimited `git diff --name-only --no-renames`; reject malformed input; cross-tier renames are full.
- This workflow file changing must classify as full. Exact required branch-protection job names remain present. Gate fails if any required full lane fails or was skipped unexpectedly.
- Tests: synthetic path cases; real Git rename and no-diff/invalid-SHA; static checks, reusable contract checks; GitHub docs-only and frontend-only disposable PRs (never merge), full exact-HEAD CI; post-merge `main` full 17/17 required statuses, independent coverage and image workflows.
- Protect ongoing work: check branch HEAD before each push; only merge after source review and successful full E2E; preserve all deploy gates and evidence.

## Review rounds
- R1 — fail-closed classification and source trust; reject sensitive docs/fixtures.
- R2 — native PostgreSQL, Flutter, production and branch protection contracts; ensure all 17 jobs are accounted for.
- R3 — evidence, coverage attribution, no false green on skipped/failed tasks, real PR E2E.
- R4 — small diff and no feature flags, parallelism changes or migrations; full main acceptance.

## Risk assessment (1 = low / 10 = high)
Complexity 5/10, integration risk 6/10 due to 17 protected checks and release evidence, testing breadth 7/10. Expected source delta: roughly 220–400 lines including tests and plan. Stop short of merge if a protected status is missing or a coverage/release contract regresses.
