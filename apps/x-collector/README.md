# x-collector

Private Python gRPC service for experimental X/Twitter daily search collection.

The service is intentionally separate from the NestJS workers:

- protobuf owns the service-to-service contract in `libs/contracts/grpc`;
- this app owns unofficial Scweet execution, account state and proxy concerns;
- TypeScript ingestion sees only the generated gRPC contract and its own source-provider port.

## Status

This is an experimental research connector, not production X/Twitter support.
Use dedicated research accounts only. Do not use personal X/Twitter accounts.
The production path still requires an approved X API or vendor decision.

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

Run locally:

```sh
cd apps/x-collector
X_COLLECTOR_SCWEET_COOKIES_FILE=/secure/path/cookies.json \
X_COLLECTOR_SERVICE_TOKEN=local-dev-token \
python -m x_collector
```

Then enable the TypeScript ingestion adapter:

```sh
X_COLLECTOR_EXPERIMENTAL_ENABLED=1
X_COLLECTOR_GRPC_ADDRESS=127.0.0.1:50051
X_COLLECTOR_SERVICE_TOKEN=local-dev-token
```

## Runtime Env

- `X_COLLECTOR_GRPC_BIND`, default `[::]:50051`
- `X_COLLECTOR_SERVICE_TOKEN`, optional bearer token required from callers
- `X_COLLECTOR_SCWEET_COOKIES_FILE`, recommended multi-account cookies file
- `X_COLLECTOR_SCWEET_AUTH_TOKEN`, one-account quickstart fallback
- `X_COLLECTOR_SCWEET_DB_PATH`, default `var/x-collector/scweet_state.db`
- `X_COLLECTOR_SCWEET_PROXY`, optional global proxy
- `X_COLLECTOR_SCWEET_MANIFEST_SCRAPE_ON_INIT`, default `1`
- `X_COLLECTOR_SCWEET_DAILY_REQUESTS_LIMIT`, default `30`
- `X_COLLECTOR_SCWEET_DAILY_TWEETS_LIMIT`, default `600`
- `X_COLLECTOR_SCWEET_REQUESTS_PER_MINUTE`, default `30`
- `X_COLLECTOR_SCWEET_MIN_DELAY_SECONDS`, default `2.0`
- `X_COLLECTOR_SCWEET_N_SPLITS`, default `5`
- `X_COLLECTOR_SCWEET_API_PAGE_SIZE`, default `20`
- `X_COLLECTOR_SCWEET_MAX_EMPTY_PAGES`, default `1`
