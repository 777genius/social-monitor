# Jev default activation handoff (code only)

Owner direction on 2026-09-24 changed the rollout decision: `jev_primary_v3` is now the default for new interest-scoped reader summary jobs. Existing jobs and publications retain their frozen strategy. This change does not deploy or rewrite historical summaries, and it does not replace the separate global feed ranking API.

## Runtime contract

- API and intelligence-worker default to `jev_primary_v3` outside `NODE_ENV=test`. The test process defaults to V2 so isolated in-memory composition tests do not require production services; tests that exercise primary set the mode explicitly. `legacy_v2` is an explicit deployment rollback setting; `jev_shadow` still requires an explicit scope list and backfill start.
- Without `READER_VALUE_DISCOVERY_SCOPES`, the worker pages currently enabled interests that have an enabled source binding and visible feed items. Each discovery tick visits at most 25 scopes and 100 items. An explicit scope list still bounds the rollout when supplied.
- Without `READER_VALUE_BACKFILL_FROM`, primary discovery uses a seven-day lookback anchored at worker startup. Set a UTC timestamp explicitly for a longer, deliberate backfill. Restart after more than seven days of downtime requires an explicit backfill start to avoid a gap.
- Primary requires Prisma relevance and summary persistence, the scoring loop, the reader-summary due poller, and a non-empty `OPENROUTER_API_KEY` in the intelligence-worker. Startup fails when prerequisites are missing; it does not silently select V2. The agent-runtime service and its supported subscription auth must also be healthy for presentation and final summary generation.
- The repository's local in-memory `.env.example` explicitly uses `legacy_v2`. `docker-compose.yml` overrides it to primary with both loops enabled. Production deployment has separate configuration and must reproduce the primary contract; do not infer deployment from this compose file.

## Deployment agent checks (not performed by this PR)

1. Apply additive migrations, start durable API/intelligence-worker/agent-runtime with the same mode and scope policy, and verify healthy dependencies. Do not use a real project for agent-runtime smoke tests; use a sandbox/test project.
2. Verify Jev provider key delivery without printing it, bounded assessment discovery, due-poller progress, and one synthetic interest-scoped V3 summary through publication and readback. Confirm a different interest is also V3 when no scope override is set.
3. Watch provider pause, assessment backlog age, summary deadlines, V3 publication failures, and cost. Roll back new jobs with `READER_VALUE_MODE=legacy_v2`; keep the scoring loop and due poller available to drain frozen V3 jobs. Emergency cancellation remains scoped to exact jobs.

The earlier heldout comparison in `docs/reports/2026-09-21-jev-heldout-quality-comparison.md` did not cover the exact current rubric or full V3 output. The owner chose default activation despite that evidence gap. This PR must not be described as a same-snapshot quality proof or a production E2E result.
