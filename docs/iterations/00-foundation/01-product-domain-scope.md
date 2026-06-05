# Iteration 00 / Phase 01 - Product Domain Scope

## Objective

Lock the MVP product boundary and domain language before writing application code.

## Steps

1. Define the MVP user story: one tenant creates topics, connects HN/RSS, scans periodically, sees normalized items and AI summaries.
2. Write ubiquitous language: tenant, topic, source binding, scan policy, source item, cluster, summary, digest, credential health.
3. Split core vs infrastructure: product core is monitoring/summaries; source acquisition is replaceable adapter infrastructure.
4. Define non-goals: no scraper-first architecture, no anti-bot bypass, no broad X/Meta/TikTok promises in MVP.
5. Create a source priority list: HN, RSS/Atom, Dev.to/GitHub optional; Reddit after terms; X/Meta/TikTok later.
6. Record explicit assumptions in ADR/memory.
7. Create source readiness categories: `mvp_now`, `beta_candidate`, `provider_or_paid_only`, `manual_research_only`, `rejected_for_production`.
8. Require a capability profile and risk class before any source appears in UI or roadmap commitments.

## Source Readiness Rule

Every source decision must answer:

1. What acquisition path is allowed: official API, open API, RSS/Atom, licensed provider, owned-account export/import, manual research capture or rejected.
2. Which content units are supported: posts, comments/replies, users/authors, communities, media, links, metadata.
3. Which query modes are supported: topic keyword search, subreddit/community feed, account feed, list/feed URL, thread hydration, historical backfill.
4. Which identity is stable: provider item id, canonical URL, content hash or composite key.
5. Which limits apply: app quota, tenant/user quota, rate limit, backfill window, paid tier, data retention.
6. Which failure states users see: unavailable capability, quota exhausted, credential unhealthy, source paused, provider outage.
7. Which compliance notes exist: provider terms, commercial use limits, credential ownership, retention constraints.
8. Which fallback exists: reduce scan frequency, disable comments, switch provider, manual capture, defer source.

## Edge Cases

- User asks for "all social networks" but budget cannot support it.
- Source supports posts but not comments.
- Source requires tenant-owned account rather than public search.
- API terms change after implementation.
- Source supports personal use but not commercial/multi-user operation.
- Source has useful data but no stable cursor or item identity.
- A paid provider supports source access but changes unit economics.

## Pay Attention

- Avoid building social-network-specific concepts into the domain model.
- Do not let X/Twitter requirements dominate the MVP.
- Keep "summary rules" tenant-configurable but bounded.

## Acceptance Criteria

- Domain glossary exists.
- MVP source list is explicit.
- Non-goals are documented.
- Every planned source has an acquisition mode.
- Every planned source has readiness category, risk class and capability profile owner.
- Product owner can explain MVP in one sentence.
