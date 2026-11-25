# 328 - Source Priority Matrix 2026

## Last Verified

2026-06-04.

## Decision

Prioritize sources by reliability, compliance, cost and product signal, not by brand fame.

For this product, developer/community sources are better early bets than closed consumer platforms.

## Priority 1 - MVP Sources

Use first:

- Hacker News official Firebase API
- RSS/Atom explicit feeds
- Dev.to/Forem API or RSS
- GitHub REST/GraphQL search for public discovery
- Product Hunt only for personal/non-commercial or after commercial clearance

Why:

- low friction
- high signal for builders
- cheaper
- easier summaries
- official/open-web paths

## Priority 2 - Early SaaS Sources

Add:

- Reddit official API after terms/approval
- Stack Exchange API
- Discourse/forums via API/RSS
- Bluesky search
- Mastodon selected instances
- Slack/Discord tenant-authorized communities

Why:

- strong community demand signals
- mostly API/authorized paths
- valuable for B2B/indie users

## Priority 3 - Paid/Enterprise Sources

Add with budget/entitlement:

- X official API/recent search/stream
- YouTube Data API
- app store reviews for owned apps
- LinkedIn owned organization pages
- Instagram/Facebook owned profiles
- podcast provider search

Why:

- useful but more quota/permission/cost constrained

## Priority 4 - Partner/Vendor Sources

Use provider adapters for:

- broad Reddit firehose/archives
- X firehose/archive
- TikTok public data
- Meta broad listening
- Quora/knowledge communities
- broad news/review/forum coverage

Why:

- direct official access may be unavailable, expensive or restricted

## Defer / Avoid As Core

Avoid production core:

- browser scraping of closed social networks
- login automation
- anti-bot workarounds
- mobile app automation
- unofficial private endpoints

Reason:

- reliability/legal/compliance risk
- not scalable
- weak enterprise posture

## Source Score Fields

Every candidate source gets:

```text
signal_value
official_access
cost
quota_risk
terms_risk
implementation_complexity
data_freshness
coverage_completeness
tenant_authorization_required
summary_value
```

## Architecture Rule

Start where source acquisition is clean and signal is high.

Expand into expensive/closed sources only when users prove value and budget exists.
