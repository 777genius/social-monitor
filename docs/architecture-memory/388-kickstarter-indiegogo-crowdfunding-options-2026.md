# 388 - Kickstarter/Indiegogo Crowdfunding Options 2026

## Last Verified

2026-06-04.

## Sources

- Indiegogo public API docs: https://help.indiegogo.com/article/616-indiegogo-public-api
- Indiegogo campaign updates API: https://developer.indiegogo.com/v1.1/reference/campaign-updates
- Indiegogo project updates help: https://help.indiegogo.com/article/489-project-updates
- Kickstarter Q1 2026 product updates: https://updates.kickstarter.com/kickstarter-q1-product-updates-reach-your-followers-streamline-fulfillment-and-more/
- Kickstarter follower-only update feature context: https://start.kickstarter.com/kickstarter-release-notes/updates-to-project-followers
- 2026 Kickstarter creator/community discussions reviewed 2026-06-04.

## Current Reality

Crowdfunding platforms are valuable for product launches, creator updates, backer sentiment, competitive launches and early market signals.

They should be modeled as campaign/community sources, not generic post feeds.

## Indiegogo Option A - Public API

Pros:

- public API documentation exists
- supports creators and active crowdfunding project retrieval
- campaign updates endpoint exists in developer docs

Cons:

- API versioning and endpoint freshness must be validated
- comments/backer-only data may not be public
- project updates can have audience restrictions

Use for:

- campaign discovery
- public update monitoring

## Kickstarter Option B - Public Campaign/Open Web Monitoring

Pros:

- campaign pages, updates and comments are high-value public launch signals
- 2026 follower-only update feature increases update importance

Cons:

- no clearly open official broad public API found in this pass
- some updates may be follower/backer-only
- public page monitoring must respect terms and robots/policy

Use for:

- open-web/SERP/RSS-like discovery where allowed
- creator-provided campaign watchlists

## Kickstarter Option C - Creator-Owned Monitoring

Pros:

- creator can monitor own campaign updates, comments and stats through platform UI/export workflows
- high product value for campaign operators

Cons:

- requires tenant ownership/authorization
- official API/export availability must be confirmed

Use for:

- crowdfunding creator dashboard

## Option D - Scraping Backer/Private Updates

Decision:

```text
rejected_not_production_safe
```

## Recommended Path

```text
Indiegogo API first; Kickstarter user-provided campaign watchlists and public/open-web monitoring only
```

## Architecture Rule

Crowdfunding sources need `CampaignSourceProviderPort` with campaign id, creator, funding state, update visibility, comment availability, pledge/backer metrics and timeline events.

