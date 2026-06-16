# 219 - Source Reddit Implementation V1

## Decision

Reddit V1 uses official Reddit Data API access through OAuth and a strict provider adapter.

No unofficial scraping, anti-bot bypass, CAPTCHA avoidance or private endpoint use is part of the architecture.

## Sources

- Reddit Data API terms: https://redditinc.com/policies/data-api-terms
- Reddit Data API wiki/help: https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki
- Reddit developer platform access: https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data
- Reddit API documentation: https://www.reddit.com/dev/api/
- Reddit developer guidelines: https://developers.reddit.com/docs/guidelines

## Connector Role

Reddit connector is an infrastructure adapter behind:

```text
SourceProviderPort
  validateCredentials
  estimateQueryCost
  scan
  refreshCursor
  mapProviderError
```

Domain code never calls Reddit directly.

## Supported V1 Capabilities

V1 should support:

- subreddit listing scans
- search queries where allowed by API behavior and terms
- post metadata ingestion
- comment ingestion only when a topic policy explicitly needs it
- permalink capture
- author id/handle capture only under data minimization rules

V1 should not support:

- mass historical backfill
- full comment-tree crawling by default
- deleted/removed content reconstruction
- user surveillance workflows
- commercial redistribution unless explicitly permitted by current terms

## OAuth And Credentials

Credentials are tenant/source scoped.

Required:

- app registration metadata
- OAuth token encryption
- refresh monitoring
- per-tenant credential health
- revocation workflow
- least-privilege scopes
- source policy acceptance record

## Rate And Quota Policy

Scheduler must treat Reddit as quota-sensitive:

- global provider budget
- per-tenant budget
- per-credential budget
- endpoint weight
- adaptive backoff from headers/errors
- degraded status when quota limited

No worker may retry Reddit errors blindly.

## Cursor Strategy

Use source-specific cursors:

- subreddit id/name
- listing sort
- provider pagination token
- newest seen item id/time
- checkpoint generation
- query hash

Commit checkpoint only after normalized items are persisted and outbox events are written.

## Data Mapping

Map Reddit posts into canonical `SourceItem`:

- provider item id
- source type `reddit`
- community/subreddit
- title
- body/text if permitted and needed
- url/permalink
- score/comment count as metrics
- created timestamp
- author reference when policy allows
- raw payload pointer

Raw payload goes to object storage with retention and access policy.

## Policy Gate

Before enabling Reddit for a tenant:

- accepted source terms record exists
- usage purpose is recorded
- plan/budget allows expected request volume
- query estimate fits provider budget
- retention policy is assigned

## Failure Semantics

Expected failure classes:

- auth expired
- forbidden/private community
- rate limited
- endpoint unavailable
- policy disabled
- malformed query

Each maps to tenant-visible source status, not generic worker failure.

## Testing

Required:

- contract tests for API client mapping
- replay fixtures with redacted payloads
- quota/backoff tests
- checkpoint resume tests
- policy-disabled tests
- deletion/retention tests for raw payloads

## MVP Implementation Status

Implemented MVP path:

- `RedditSourceProvider` sits behind `SourceProviderPort`.
- `HttpRedditClient` uses `https://oauth.reddit.com` with a bearer token and explicit `user-agent`.
- `FixtureRedditClient` powers deterministic certification and does not use network.
- `npm run check:source-certification` is the blocking release gate for fixture behavior, cursor contract, item identity, unsupported query rejection and error classification.
- `npm run check:live-reddit-oauth` is an optional operator smoke. It skips cleanly when `REDDIT_ACCESS_TOKEN` is absent and verifies real OAuth scanning when a tenant-owned token is supplied.

Operational rule:

- HN/RSS/GitHub can be live-smoked without credentials through `npm run check:live-open-connectors`.
- Reddit cannot be honestly live-smoked through official access without an OAuth token. Do not add anonymous scraping or anti-bot bypass as a fallback.

## Architecture Rule

If Reddit access terms or economics change, replace or disable the adapter. Do not change domain concepts to match Reddit-specific constraints.
