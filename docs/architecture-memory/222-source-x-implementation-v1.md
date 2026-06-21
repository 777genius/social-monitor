# 222 - Source X Implementation V1

## Last Verified

2026-06-21 against official X Developer Platform documentation.

## Decision

X/Twitter integration is built behind a provider abstraction with hard budget, entitlement and policy gates.

The product must not depend on X as a guaranteed cheap or stable source.

For the backend MVP/beta, X remains deferred until a paid/direct X API budget or approved vendor contract is accepted. X must not block the core loop for HN, RSS, GitHub, Reddit, summaries, delivery and audit.

## Sources

- X Search Posts documentation: https://docs.x.com/x-api/posts/search/introduction
- X recent search endpoint: https://docs.x.com/x-api/posts/recent-search
- X query guide: https://docs.x.com/x-api/posts/search/integrate/build-a-query
- X API v2 rate limits reference: https://docs.x.com/x-api/fundamentals/rate-limits
- X API pay-per-usage pricing: https://docs.x.com/x-api/getting-started/pricing
- X OAuth 2.0 Authorization Code Flow with PKCE: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
- X API v2 authentication mapping: https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping
- X limits help: https://help.x.com/en/rules-and-policies/x-limits

## Current Facts To Design Around

- X API v2 is pay-per-usage and credit-based. Credits are purchased upfront, endpoint costs differ, and spend should be monitored in the Developer Console.
- X rate limits are endpoint-specific. The adapter must persist `x-rate-limit-limit`, `x-rate-limit-remaining`, `x-rate-limit-reset` style evidence when available and treat HTTP 429 as provider-rate-limited.
- Recent search is the realistic first direct API primitive for monitoring. It covers recent posts, not full historical archive.
- Full-archive search is not a default MVP primitive; it requires special access and should be modeled as a separate capability.
- OAuth 2.0 Authorization Code with PKCE can support read endpoints with `tweet.read users.read`; `offline.access` is only justified when background scans need refresh tokens.

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

## Adapter Options

1. Direct X API recent-search adapter - 🎯 8   🛡️ 8   🧠 6
   Примерно 700-1400 строк. Best fit once paid API budget is approved. It gives official access and clean compliance, but beta must enforce spend caps, per-endpoint rate limits and access-tier capability checks before enabling tenant bindings.

2. Approved social-listening/vendor adapter - 🎯 7   🛡️ 8   🧠 7
   Примерно 900-1800 строк plus vendor contract work. Useful if direct X economics or access tiers are bad for beta. The domain still sees normalized `SourceItem`; vendor-specific payloads stay behind adapter and evidence contracts.

3. Deferred disabled-provider stub - 🎯 9   🛡️ 9   🧠 3
   Примерно 150-350 строк. Best current beta posture. Product can expose "not enabled" capability metadata and avoid misleading users, while the backend keeps source abstraction ready without scraping or credential risk.

## Minimum Enablement Gates

Before any X binding can be enabled:

- tenant has explicit X entitlement;
- spend cap and monthly request budget are configured;
- scan interval floor is enforced;
- endpoint-level rate-limit headers are captured;
- query compiler estimates access tier and cost before first scan;
- credential lifecycle, refresh behavior and auth failure evidence are attached;
- X data retention/deletion policy is documented;
- fallback behavior is chosen when X is unavailable, expensive or rate-limited.

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
