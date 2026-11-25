# 380 - Steam Gaming Community Review Options 2026

## Last Verified

2026-06-04.

## Sources

- Steam User Reviews - Get List: https://partner.steamgames.com/doc/store/getreviews
- Steam User Reviews support docs: https://help.steampowered.com/en/faqs/view/2DA6-9CB3-F84A-643E
- Steam Web API docs: https://steamcommunity.com/dev
- Steam ISteamUserStats docs: https://partner.steamgames.com/doc/webapi/isteamuserstats
- Steam review API reliability/community context reviewed 2026-06-04.
- Discord/gaming-community migration context reviewed 2026-06-04.

## Current Reality

Steam is a strong source for gaming/product reputation. It has a documented review list endpoint for app reviews and broader Web API surfaces for player counts/stats.

Steam should be modeled as a product/community review source, not as a generic social feed.

## Option A - Steam App Reviews Endpoint

Pros:

- documented review retrieval endpoint
- supports review paging/cursors
- supports filters such as recent/updated/all and language
- valuable for game/software product monitoring

Cons:

- app-specific, not global topic search
- review score rules can exclude off-topic review periods
- endpoint behavior must be monitored for cursor/reliability edge cases

Use for:

- game/app review monitoring
- indie game reputation alerts

## Option B - Steam Web API / Player Stats

Pros:

- official API docs exist
- player count and global stats can enrich review trends

Cons:

- not a conversation source
- permissions and key types can be confusing

Use for:

- context enrichment

## Option C - Steam Community Discussions / Groups

Pros:

- relevant for gaming community monitoring
- can capture support issues and player sentiment

Cons:

- official structured access is less straightforward than app reviews
- forum/group rules and access vary

Use for:

- later forum/community source evaluation

## Option D - Scraping Steam Community Pages

Decision:

```text
research_only; not MVP default
```

## Recommended Path

```text
Steam app reviews are early_saas_approved for gaming/product users; discussions are later research
```

## Architecture Rule

Steam reviews belong to `ProductReviewSourceProviderPort` with fields for app id, recommendation, playtime, review language, helpful votes, purchase type and review visibility filters.

