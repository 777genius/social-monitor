# 347 - VK Acquisition Options 2026

## Last Verified

2026-06-04.

## Sources

- VK official developer portal: https://dev.vk.com/
- VK platform overview and search behavior context: https://en.wikipedia.org/wiki/VK_%28service%29
- Public developer/community reports about VK search filter changes: https://www.reddit.com/r/vkontakte/comments/1q5wfze/vk_killed_their_search_filters_altogether/
- Public developer/community reports about VK safe-search/API behavior changes: https://www.reddit.com/r/vkontakte/comments/1g3qule/vk_disable_safe_search_removed_forever/

## Current Reality

VK has an official developer platform, but public post search and filter behavior can be region-sensitive, policy-sensitive and unstable.

For a Western/global SaaS MVP, VK is not a first-wave source unless the product explicitly targets Russian/CIS markets.

## Option A - Official VK API

Pros:

- official developer entry point
- can support owned/community/page scenarios where permitted
- fits clean connector architecture

Cons:

- API availability and permissions vary
- broad public search behavior may be constrained
- regional legal/compliance review required

Use for:

- opted-in communities/pages
- regional package after policy review

## Option B - Search/Index Provider

Pros:

- can detect public URLs and mentions from web indexes
- avoids direct platform integration initially

Cons:

- incomplete
- delayed
- no reliable comments/reactions

Use for:

- candidate discovery only

## Option C - Regional Data Vendor

Pros:

- may provide better coverage than direct API
- externalizes platform-specific operations

Cons:

- contract and data-rights review required
- cost/quality varies
- vendor lock-in

Use for:

- enterprise regional monitoring

## Option D - Unofficial Scraping

Decision:

```text
rejected_not_production_safe
```

## Recommended Path

```text
defer for MVP; keep provider interface ready
```

## Architecture Rule

VK should be modeled as `regional_optional_source`, not as core MVP infrastructure.

