# X/Twitter Provider

Provider key: `x-twitter`

Legacy alias: `x-twitter-experimental-daily`

This provider is not a normal plug-and-play public API integration. In the
current repo it is available only through the private Python `x-collector` gRPC
service.

## Status

- Runtime readiness: deferred/provider-only unless `x-collector` is configured.
- Use dedicated research accounts only.
- Do not use personal X/Twitter accounts.
- Do not enable it for a tenant without explicit policy, rate-limit, account
  budget and rollback approval.

## Setup

See the service README:

- [apps/x-collector/README.md](../../apps/x-collector/README.md)

Start the collector:

```sh
cd apps/x-collector
python3 -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"

X_COLLECTOR_SCWEET_COOKIES_FILE=/secure/path/cookies.json \
X_COLLECTOR_SERVICE_TOKEN=local-dev-token \
python -m x_collector
```

Enable the TypeScript ingestion adapter:

```sh
X_COLLECTOR_ENABLED=1
X_COLLECTOR_GRPC_ADDRESS=127.0.0.1:50051
X_COLLECTOR_SERVICE_TOKEN=local-dev-token
```

`X_COLLECTOR_EXPERIMENTAL_ENABLED=1` is still accepted as a legacy alias.

## Supported Binding Config

- `mode`: must be `search` when provided.
- `query` or `term`: required, 2 to 500 characters.
- `searchProducts`: `top`, `latest`, or both.
- `language`: optional language code.
- `windowHours`: integer from 1 to 72.
- `maxItems`: integer from 1 to 100.
- `limitPerProduct`: integer from 1 to 100.
- `minLikes`, `minRetweets`, `minReplies`: optional metric floors.
- `queryLaneHandles`, `trackedHandles`, `handles`: optional lane inputs.
- `queryLaneProductTerms`, `productTerms`, `entityTerms`: optional lane inputs.
- `maxSearchQueries`, `includeFromLanes`, `includeMentionLanes`,
  `includeFallbackQuery`: advanced query-lane controls.

## Example Binding

```json
{
  "providerKey": "x-twitter",
  "config": {
    "mode": "search",
    "query": "OpenAI developer tools",
    "searchProducts": ["top", "latest"],
    "language": "en",
    "windowHours": 24,
    "maxItems": 25
  }
}
```

## Checks

Unit and service checks:

```sh
npm run x-collector:test
```

Gated real e2e:

```sh
cd apps/x-collector
X_COLLECTOR_REAL_E2E=1 \
X_COLLECTOR_SCWEET_COOKIES_FILE=/secure/path/cookies.json \
python3 -m pytest tests/test_real_e2e.py
```

## Operational Notes

- Store cookies/tokens outside the git workspace.
- Configure daily request/tweet budgets before live collection.
- Keep account observability enabled so operators can audit usage without
  exposing cookies or auth tokens.
- If X pricing, limits or terms conflict with product economics, disable X
  bindings and keep other providers running.
