# Iteration 07 / Phase 01 - Beta Scope Freeze

## Objective

Freeze beta scope and prevent last-minute architecture drift.

## Steps

1. Confirm beta source set.
2. Confirm beta user flows.
3. Confirm non-goals and deferred features.
4. Freeze API contracts for beta.
5. Freeze frontend deferral scope.
6. Create beta risk register.

## Scope Freeze Table

| Area | In Beta | Out Of Beta |
| --- | --- | --- |
| Sources | fake, HN, RSS/open feed paths that passed certification | broad X/Twitter, unsupported Reddit, unsupported Telegram, unsafe scraping |
| Backend | modular monorepo, REST/OpenAPI, workers, outbox/inbox, quotas | physical split of every context, complex saga framework |
| Frontend | deferred; API/operator beta uses OpenAPI/generated client/status harness | Flutter app, web dashboard, advanced dashboards, marketing pages, broad analytics |
| AI | structured cited summaries, eval gates, cost telemetry | multi-agent research, fine-tuning, unsupported fact-checking |
| Delivery | WS status, in-app status, digest foundation | marketplace integrations, Slack/Telegram/push unless already stable |
| Ops | tenant isolation, redaction, runbooks, dashboards | formal enterprise certification, multi-region |

## Beta Capacity Freeze

Freeze the launch envelope together with feature scope:

1. maximum beta tenants per ring
2. topics per tenant
3. source bindings per topic
4. minimum scan interval per source/capability
5. daily scan, summary and delivery budgets
6. queue lag thresholds for hold/rework
7. cost ceiling per tenant/ring
8. source-specific backfill and retention limits

Changing these values during beta requires go/hold/rework decision with usage, cost, support and source-health evidence.

## Scope Change Rule

A beta scope change is allowed only if it is one of:

1. blocker fix for core loop
2. safety/security/privacy fix
3. supportability fix needed for beta operation
4. small UX clarification that does not change contracts

New source, new transport, new data model or new integration requires ADR/source readiness decision and cannot silently enter launch scope.

## Edge Cases

- Stakeholder asks for X/Telegram before core works.
- New source requires different domain model.
- Mobile UX depends on backend feature not ready.
- Beta user requests broad social coverage during onboarding.
- New feature would require changing summary/feed contract after mobile freeze.
- A requested source has personal-use access but unclear SaaS/commercial rights.
- Beta ring wants expansion while scan freshness or cost envelope is already yellow.
- One tenant's requested limits would reduce reliability for other tenants.

## Pay Attention

- Freeze scope does not mean freeze bug fixes.
- New source requests go to backlog unless critical.
- Keep MVP powerful but coherent.
- Freeze does not block learning; it blocks uncontrolled build scope.
- Accepted MVP gaps must have owner and user-facing limitation language.
- Capacity limits are part of scope; do not hide them as internal ops details.
- Frontend deferral is allowed only if API/operator workflow can complete the backend loop and support can diagnose failures.

## Acceptance Criteria

- Beta checklist signed off.
- Contracts versioned.
- Deferred features documented.
- Risk register has owners.
- Scope freeze table is approved.
- Source expansion decision rule is linked from onboarding/support docs.
- Beta capacity envelope and ring expansion thresholds are approved.
- Frontend deferral and future frontend options are documented.
