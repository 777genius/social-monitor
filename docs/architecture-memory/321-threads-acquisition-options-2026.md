# 321 - Threads Acquisition Options 2026

## Last Verified

2026-06-04.

## Sources

- Meta Threads API Postman workspace: https://www.postman.com/meta/threads/overview
- Threads API changelog reference from Meta Postman: https://developers.facebook.com/docs/threads/changelog
- Meta Graph API docs: https://developers.facebook.com/docs/graph-api/
- Brandwatch source docs: https://social-media-management-help.brandwatch.com/hc/en-us/articles/4556945084701-Sources-for-Listen-Mentions
- Fedica supported networks FAQ: https://fedica.com/info/faq

## Current Reality

Threads has an official API surface, but it is primarily oriented around authenticated account publishing, retrieval, replies and insights, not broad public firehose listening.

Several social management tools list Threads support, but that does not imply broad public keyword monitoring.

## Option A - Threads API For Connected Accounts

Pros:

- official Meta developer path
- useful for tenant-owned Threads accounts
- supports publishing/replies/insights workflows where permissions allow
- fits owned-channel monitoring

Cons:

- Meta app review/provider verification friction
- not a broad public search/firehose replacement
- API surface and docs are still evolving
- connected account required

Use for:

- owned Threads account analytics/replies
- tenant-managed social workflows

## Option B - Meta/Social Management Partner Provider

Pros:

- may abstract Meta approval and API changes
- useful if customers need scheduling/owned profile workflows

Cons:

- vendor lock-in
- coverage may be owned-account only
- not necessarily social listening

Use as replaceable adapter only.

## Option C - Fediverse/ActivityPub Bridge Signals

Pros:

- Threads has federation-related roadmap/activity
- open-protocol path may become useful later

Cons:

- partial availability
- moderation/federation policy complexity
- not enough for reliable broad monitoring today

Use only as future research.

## Option D - Browser Scraping

Pros:

- may appear to expose public posts

Cons:

- brittle
- Meta anti-abuse risk
- terms/privacy risk
- not production-safe

Decision:

- not production path

## Recommended Path

Defer broad Threads listening.

If added:

```text
owned connected account integration first
partner/vendor adapter later if customers need more
```

## Architecture Rule

Threads support means owned-account integration unless a current official/partner capability proves broad listening.
