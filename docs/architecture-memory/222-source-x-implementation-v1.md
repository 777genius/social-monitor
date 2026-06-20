# 222 - Source X Implementation V1

## Decision

X/Twitter integration is built behind a provider abstraction with hard budget, entitlement and policy gates.

The product must not depend on X as a guaranteed cheap or stable source.

## Sources

- X Search Posts documentation: https://docs.x.com/x-api/posts/search/introduction
- X recent search endpoint: https://docs.x.com/x-api/posts/recent-search
- X query guide: https://docs.x.com/x-api/posts/search/integrate/build-a-query
- X API v2 rate limits reference: https://docs.x.com/x-api/fundamentals/rate-limits
- X API pay-per-usage pricing: https://docs.x.com/x-api/getting-started/pricing
- X OAuth 2.0 Authorization Code Flow with PKCE: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
- X API v2 authentication mapping: https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping
- X limits help: https://help.x.com/en/rules-and-policies/x-limits

## V1 Scope

V1 supports only read monitoring through approved API access.

Minimum direct API read-only scopes:

```text
tweet.read users.read
```

Use `offline.access` only when refresh tokens are required for background scans.

Potential capabilities:

- recent search
- user/handle monitoring where API access allows
- hashtag/keyword query monitoring
- URL/domain mention monitoring
- language/operator constraints where supported

Out of scope:

- browser scraping
- login automation
- private endpoint use
- bot-detection bypass
- automated engagement actions
- mass historical archive by default

## Provider Adapter

```text
XProviderAdapter implements SourceProviderPort
  validateCredentials()
  estimateQueryCost()
  compileQuery(providerNeutralQuery)
  scanRecent()
  mapRateLimit()
  mapPolicyError()
```

The adapter is replaceable by:

- direct X API
- approved reseller/social-listening provider
- tenant-provided API credentials
- disabled provider stub

## Query Compilation

Topic DSL compiles to provider-neutral query first.

Then X adapter maps it to X operators if supported.

If an operator requires a higher access level, adapter must return:

```text
capability_unavailable
required_capability
estimated_cost
fallback_behavior
```

No feature may assume all query operators are always available.

## Cost Guardrails

Before enabling an X source binding:

- tenant plan allows X
- provider credentials are healthy
- query cost estimate fits budget
- scan interval is above minimum
- expected monthly reads are visible to tenant/admin
- pay-per-usage credits and spend caps are configured
- endpoint-level rate-limit headers are persisted
- downgrade/fallback behavior is selected

For personal MVP, keep X disabled until API economics are explicitly accepted.

## Cursor Strategy

Use source cursor fields:

- query hash
- newest seen post id
- since id / start time when supported
- provider pagination token
- scan window start/end
- access tier snapshot

Do not rely only on timestamps because social APIs can return late-arriving or reordered results.

## Data Mapping

Map posts into canonical `SourceItem`:

- provider post id
- author reference if policy allows
- text
- URL/permalink
- created timestamp
- public metrics where included
- conversation/reference ids where included
- language when included
- raw payload pointer

Sensitive fields require data classification before persistence.

## Reliability

Expected errors:

- rate limited
- access tier insufficient
- auth expired
- query invalid
- account suspended/restricted
- endpoint unavailable
- provider policy disabled

All errors map to tenant-visible source status.

## Architecture Rule

X is an important connector, not a core dependency.

If X pricing, limits or terms conflict with the product economics, the platform degrades by disabling X bindings while keeping topics, summaries, digests and other sources working.
