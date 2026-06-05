# 98. Source Provider Contracts

## Status

Locked for architecture baseline.

## Research Anchors

- OWASP API Security Top 10: https://owasp.org/API-Security/editions/2023/en/0x00-header/
- NIST Cybersecurity Framework: https://www.nist.gov/cyberframework

## Decision

Source acquisition providers are replaceable adapters with explicit contracts. The product must not depend on one provider's unofficial behavior.

## Provider Evaluation Checklist

Required:

- documented API or documented commercial access path;
- legal/terms compatibility for intended use;
- quota/rate-limit documentation;
- authentication model;
- data fields available;
- historical lookback limits;
- latency/freshness expectations;
- pricing model;
- status page or support channel;
- deletion/compliance behavior;
- export/lock-in risk;
- security posture for credentials and webhooks.

## Adapter Contract

Every source adapter must expose:

- `discoverCapabilities()`;
- `validateCredentials()`;
- `estimateCost(scanPolicy)`;
- `fetchIncremental(cursor, policy)`;
- `fetchBackfill(window, policy)`;
- `normalize(rawPayload)`;
- `mapProviderError(error)`;
- `getQuotaState()`;

Adapters return provider-neutral errors:

- unauthorized;
- forbidden_by_policy;
- quota_exhausted;
- temporarily_unavailable;
- malformed_query;
- content_unavailable;
- provider_contract_changed.

## Procurement Rule

Do not optimize for cheapest provider if it destroys reliability or compliance. Prefer a more expensive official or well-documented provider over brittle acquisition paths.

## Best-Fact Choice

Provider abstraction is not enough. The contract must include capability discovery, cost estimation, quota state and policy errors, because scheduler and billing decisions depend on those facts.

