# x-collector

Private Python gRPC service for X/Twitter daily search collection.

The service is intentionally separate from the NestJS workers:

- protobuf owns the service-to-service contract in `libs/contracts/grpc`;
- this app owns Scweet execution, account state and proxy concerns as implementation detail;
- TypeScript ingestion sees only the generated gRPC contract and its own source-provider port.

## Status

This is the private runtime behind the canonical `x-twitter` source provider.
Use dedicated research accounts only. Do not use personal X/Twitter accounts.
Keep production rollout behind explicit enablement, daily caps, health checks and rate-limit evidence.

## Setup

```sh
cd apps/x-collector
python3 -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
```

Generate Python protobuf stubs after changing `libs/contracts/grpc`:

```sh
cd ../..
npm run x-collector:generate-grpc
```

Run tests:

```sh
cd ../..
npm run x-collector:test
```

Run gated live X e2e locally:

```sh
cd apps/x-collector
X_COLLECTOR_REAL_E2E=1 \
X_COLLECTOR_SCWEET_COOKIES_FILE=/secure/path/cookies.json \
python3 -m pytest tests/test_real_e2e.py
```

Run locally:

```sh
cd apps/x-collector
X_COLLECTOR_SCWEET_COOKIES_FILE=/secure/path/cookies.json \
X_COLLECTOR_SERVICE_TOKEN=local-dev-token \
python -m x_collector
```

Then enable the TypeScript ingestion adapter:

```sh
X_COLLECTOR_ENABLED=1
X_COLLECTOR_GRPC_ADDRESS=127.0.0.1:50051
X_COLLECTOR_SERVICE_TOKEN=local-dev-token
```

`X_COLLECTOR_EXPERIMENTAL_ENABLED=1` remains accepted as a legacy compatibility alias.

## Runtime Env

- `X_COLLECTOR_GRPC_BIND`, default `[::]:50051`
- `X_COLLECTOR_ENABLED`, TypeScript worker opt-in flag for the canonical `x-twitter` provider
- `X_COLLECTOR_SERVICE_TOKEN`, optional bearer token required from callers
- `X_COLLECTOR_SCWEET_COOKIES_FILE`, recommended multi-account cookies file
- `X_COLLECTOR_SCWEET_AUTH_TOKEN`, one-account quickstart fallback
- `X_COLLECTOR_SCWEET_DB_PATH`, default `var/x-collector/scweet_state.db`
- `X_COLLECTOR_SCWEET_PROXY`, optional global proxy
- `X_COLLECTOR_SCWEET_MANIFEST_SCRAPE_ON_INIT`, default `1`
- `X_COLLECTOR_SCWEET_DAILY_REQUESTS_LIMIT`, default `30`
- `X_COLLECTOR_SCWEET_DAILY_TWEETS_LIMIT`, default `600`
- `X_COLLECTOR_SCWEET_ACCOUNT_LIMITS_JSON`, optional per-account budget guard
  profile keyed by username, for example
  `{"premium_user":{"dailyRequests":120,"dailyTweets":2000,"priority":0}}`
- `X_COLLECTOR_SCWEET_ACCOUNT_LIMITS_FILE`, optional JSON file with the same
  shape, or `{ "accounts": [{ "username": "...", "dailyRequests": 120,
  "dailyTweets": 2000, "priority": 0 }] }`. Lower priority values are leased
  first when multiple accounts are eligible. Store only usernames and limits,
  never cookies or auth tokens.
- `X_COLLECTOR_SCWEET_REQUESTS_PER_MINUTE`, default `30`
- `X_COLLECTOR_SCWEET_MIN_DELAY_SECONDS`, default `2.0`
- `X_COLLECTOR_SCWEET_N_SPLITS`, default `5`
- `X_COLLECTOR_SCWEET_API_PAGE_SIZE`, default `20`
- `X_COLLECTOR_SCWEET_MAX_EMPTY_PAGES`, default `1`
- `X_COLLECTOR_SCWEET_BUDGET_GUARD_ENABLED`, default `1`; preflights
  Scweet account pool capacity before spending requests
- `X_COLLECTOR_SCWEET_ADAPTIVE_BUDGET_ENABLED`, default `1`; derives effective
  per-account request/tweet caps from recent clean usage and observed provider
  rate limits without storing secrets
- `X_COLLECTOR_ACCOUNT_OBSERVABILITY_ENABLED`, default `1`; writes audit-only
  account usage events to the Scweet SQLite state database
