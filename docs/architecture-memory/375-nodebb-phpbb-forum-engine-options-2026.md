# 375 - NodeBB/phpBB Forum Engine Options 2026

## Last Verified

2026-06-04.

## Sources

- NodeBB documentation: https://docs.nodebb.org/
- NodeBB development docs and `/api` page data: https://docs.nodebb.org/development/
- NodeBB ActivityPub world page: https://docs.nodebb.org/activitypub/world/
- NodeBB Read API announcement: https://nodebb.org/blog/unveiling-of-the-read-api
- phpBB extensions organization: https://github.com/phpbb-extensions
- phpBB documentation/search context: https://download.phpbb.com/pub/documentation/3.0/olympus_documentation.pdf

## Current Reality

Forum engines are an underrated social intelligence source family.

Many niche communities use Discourse, NodeBB, phpBB, vBulletin, XenForo or custom forums. For MVP, the strongest forum strategy is not scraping every forum, but supporting known forum engines through official APIs, feeds, sitemaps and respectful polling.

## NodeBB Option A - REST/API Page Data

Pros:

- NodeBB has a REST API/plugin framework
- page data can be accessed through `/api` paths in many cases
- modern forum with ActivityPub direction

Cons:

- site configuration and permissions vary
- not every NodeBB site exposes the same access
- rate and etiquette must be per-site

Use for:

- known NodeBB forums
- topic/recent/search monitoring where allowed

## NodeBB Option B - ActivityPub/Federated Layer

Pros:

- can integrate with fediverse discovery
- useful as forums federate outward

Cons:

- not every forum enables federation
- conversation mapping needs context handling

Use for:

- later protocol-source integration

## phpBB Option C - Feeds/Search/Public Pages

Pros:

- large legacy forum footprint
- many forums expose RSS/Atom/search/sitemap surfaces
- good for niche communities

Cons:

- no universal official API across all phpBB forums
- site-specific permissions and anti-spam rules
- HTML parsing is fragile unless feeds/APIs exist

Use for:

- known public forums with allowed feeds/search

## Option D - Forum Scraping Without API/Feed

Decision:

```text
research_only, not default production
```

Reason:

- every forum has its own rules
- broad scraping creates etiquette/legal/reliability risk

## Recommended Path

```text
forum-engine adapter family: Discourse first, NodeBB second, feeds/sitemaps for phpBB-style legacy forums
```

## Architecture Rule

Forum monitoring should be driven by `ForumSourceProviderPort` with engine detection, per-site policy, feed/API preference and crawl-budget limits.

