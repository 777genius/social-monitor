# Iteration 07 - Beta MVP Launch Overview

## Goal

Freeze scope, onboard beta users, launch safely and create a learning loop.

The target is a powerful MVP, not a complete enterprise platform. The launch should prove the core loop: configure topics, scan reliable sources, summarize signal, deliver actionable insight.

## Beta Scope

Must include:

- tenant/workspace auth
- topic management
- source bindings for approved sources
- scheduled scans
- normalized feed
- AI summaries with citations
- realtime or near-realtime status
- mobile UX for core workflows
- basic digest/alert delivery
- admin/source health view

Must not include unless already stable:

- broad unsupported scraping
- high-risk regional sources
- complex billing automation
- enterprise SSO
- all social networks

## Controlled Beta Rings

| Ring | Users | Entry Criteria | Exit Criteria |
| --- | --- | --- | --- |
| internal dogfood | team only | staging green, fake/HN/RSS loop works | 3 clean internal runs and failure drills pass |
| private beta 1 | 3-5 trusted users | known limitations published, support ready | core loop completion by each user, no beta blockers |
| private beta 2 | 10-20 users | cost/queue/source health stable for ring 1 | weekly reliability and quality metrics stay within thresholds |
| broader MVP | invite-only expansion | roadmap priorities evidence-backed | support load and source cost remain manageable |

Expansion stops immediately on cross-tenant issue, secret leak, uncited final summary, cursor/idempotency data-loss risk or uncontrolled cost spike.

## Beta Success Metrics

Track both product value and operational safety:

| Metric | Target For MVP Learning |
| --- | --- |
| onboarding completion | most beta users can create topic, bind source and get first summary |
| useful summary feedback | positive or actionable feedback from real monitored topics |
| source reliability | HN/RSS/fake paths pass repeated scans without silent data loss |
| summary citation quality | no completed user-visible summary without citations |
| support diagnosability | common failures classified without DB/shell access |
| cost predictability | scan/AI/delivery usage visible per tenant/topic/source |
| source demand | unsupported source requests classified by value, access path and cost |

## Known Limitations Policy

Every limitation must be visible in product/support docs with:

1. what is limited
2. why it is limited
3. affected sources/features
4. user workaround or recovery action
5. owner
6. revisit trigger

Do not hide unsupported social networks behind vague "temporarily unavailable" language.

## Phase Map

1. `01-beta-scope-freeze.md` - lock beta feature set and source list.
2. `02-onboarding-support.md` - onboarding, support workflows and docs.
3. `03-launch-readiness.md` - launch checklist and incident readiness.
4. `04-post-beta-learning-loop.md` - feedback, metrics and iteration planning.

## Detailed Steps

1. Define beta user segments.
2. Define supported source list and visible limitations.
3. Define beta success metrics.
4. Freeze API and event contracts.
5. Freeze frontend core flows.
6. Prepare onboarding guide.
7. Prepare source setup guide.
8. Prepare known limitations page.
9. Prepare support-safe admin views.
10. Prepare incident runbooks.
11. Prepare feedback capture form.
12. Run internal dogfood.
13. Run private beta with 3-5 users.
14. Expand to 10-20 users only after reliability gate.
15. Review feedback weekly and update roadmap.

## Edge Cases

- User expects a source that is deferred.
- User creates overbroad topic and gets noisy summaries.
- Summary is correct but not actionable.
- Scan status is confusing.
- Source fails during onboarding demo.
- User wants team access before RBAC is polished.
- User asks to export/delete data.
- Beta user tries to monitor private/prohibited content.
- Beta user invites teammate before workspace roles are ready.
- User treats summary as source truth and disputes a cited source.
- Supported source degrades after beta invite was sent.
- Beta cost envelope is exceeded by one noisy topic.
- User requests X/Twitter/Reddit before approved source path exists.

## Pay Attention

- Beta users should understand coverage limits.
- The product must say "unsupported" clearly instead of pretending full coverage.
- Onboarding should teach topic quality and source choice.
- Support must not require direct database access.
- Feedback should distinguish source coverage requests from core workflow issues.
- Limited beta expansion is a control mechanism, not a marketing milestone.
- Beta should prove repeatable value from a narrow reliable loop before adding source breadth.

## Quality Gates

- End-to-end happy path works from clean account.
- At least 3 source failure states are visible in UI.
- Summary quality fixtures pass.
- Source health dashboard is usable by operator.
- Incident rollback/disable-source procedure is documented.
- Data export/delete request path exists, even if manual.
- Beta ring expansion criteria are written and enforced.
- Known limitations are user-visible and support-visible.

## Done Criteria

Iteration 07 is complete when beta users can repeatedly get useful summaries from real monitored sources and the team can operate incidents, support requests and source failures without ad hoc fixes.
