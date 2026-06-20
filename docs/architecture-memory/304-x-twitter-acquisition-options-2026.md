# 304 - X/Twitter Acquisition Options 2026

## Last Verified

2026-06-20.

## Sources

- X Search Posts: https://docs.x.com/x-api/posts/search/introduction
- X Recent Search: https://docs.x.com/x-api/posts/recent-search
- X Search Operators: https://docs.x.com/x-api/posts/search/integrate/operators
- X API Rate Limits: https://docs.x.com/x-api/fundamentals/rate-limits
- X API Pay-Per-Usage Pricing: https://docs.x.com/x-api/getting-started/pricing
- X OAuth 2.0 Authorization Code Flow with PKCE: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
- X API v2 Authentication Mapping: https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping
- X Enterprise Search API: https://docs.x.com/x-api/enterprise-gnip-2.0/fundamentals/search-api
- Brandwatch sources: https://social-media-management-help.brandwatch.com/hc/en-us/articles/4556945084701-Sources-for-Listen-Mentions

## Current Reality

X remains important but volatile and cost-sensitive.

X documents recent search, full-archive search, filtered stream, OAuth 2.0 scopes, pay-per-usage pricing and endpoint-level rate limits. Enterprise social listening tools often advertise official X partner/firehose access.

For monitoring-only MVP work, the default read-only OAuth 2.0 scope floor is:

```text
tweet.read users.read
```

Use `offline.access` only when refresh tokens are required for background scans.

## Option A - X API Recent Search

Pros:

- official
- good for current monitoring
- query operators
- pagination and rate-limit headers

Cons:

- limited history
- endpoint/query limits
- credit balance, per-endpoint cost and pricing risk
- sampled/coverage constraints may apply by plan

Use for:

- early X keyword/topic monitoring if budget accepted

## Option B - X Filtered Stream

Pros:

- low-latency
- good for real-time alerts
- avoids repeated polling

Cons:

- one/few connections depending access
- rule limits
- reconnect/backfill complexity
- still access-tier constrained
- reconnects can multiply cost if backfill is not controlled

Use for:

- higher-value real-time paid tiers

## Option C - Full Archive / Enterprise Search

Pros:

- historical analysis
- stronger research/enterprise coverage
- richer query limits in enterprise contexts

Cons:

- expensive
- contract/access required
- not MVP-friendly

Use later for:

- enterprise retrospectives
- brand/campaign analysis

## Option D - Official Partner/Social Listening Vendor

Pros:

- hides X API complexity
- may include firehose/historical archives
- enterprise reporting included

Cons:

- costly
- vendor lock-in
- opaque coverage/pricing
- data export restrictions

Use as:

```text
XProviderAdapter -> VendorXAdapter
```

## Option E - Browser Scraping / Login Automation

Pros:

- appears to access UI-only data

Cons:

- not reliable
- account/IP bans
- anti-bot friction
- terms/legal risk
- hard to scale

Decision:

- not production path

## Recommended Path

Default:

- keep X disabled behind entitlement/budget gate

When enabled:

- start with official recent search
- compile provider-neutral queries to X operators
- estimate cost before scan
- use stream only for paid real-time tier
- keep vendor adapter option open
- capture rate-limit headers and spend ledger entries as release evidence
- require explicit retention and deletion policy before storing normalized X items

## Architecture Rule

X is valuable but not foundational.

The product must continue working without X.
