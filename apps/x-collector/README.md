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

## Production four-account canary

`bin/run-production-canary.sh` is the fail-closed host entrypoint for the
production account canary. It is intentionally separate from the daily flow and
must be invoked only by the reviewed host scheduler with explicit paths and a
pinned image revision:

```sh
apps/x-collector/bin/run-production-canary.sh \
  plan \
  --expected-sha "$EXPECTED_RELEASE_SHA" \
  --image social-monitor-x-collector:production \
  --cookies-file /host-controlled/x-collector/cookies.json \
  --control-dir /var/data/social-monitor/control \
  --health-container social-monitor-x-collector-1

apps/x-collector/bin/run-production-canary.sh \
  run \
  --expected-sha "$EXPECTED_RELEASE_SHA" \
  --image social-monitor-x-collector:production \
  --cookies-file /host-controlled/x-collector/cookies.json \
  --control-dir /var/data/social-monitor/control \
  --health-container social-monitor-x-collector-1 \
  --output /host-controlled/social-monitor/state/x-account-canary.json
```

`plan` is read-only and performs no collection. Both actions resolve the local
image reference to an
immutable image ID, require its revision label and
`control/deploy-state/backend.sha` marker to match the expected SHA, and require
the healthy deployed container to use that exact image ID. Inventory preflight
runs inside that image with `--network=none`; it never imports host source.
After acquiring every lock, `run` repeats the backend marker, image reference,
revision label, deployed image, Compose service, running-state, and health
checks before its locked inventory read or any network-capable container.

The runner does not accept environment files, service tokens, production
database paths, queries, limits, or arbitrary container commands. External
processes and container entrypoints receive a clean allowlisted environment.
Before any network-capable Docker command it requires exactly four unique,
well-formed account entries, including unique canonical identities and unique
credential sources. Every present `username`, `screen_name`, `handle`, and
`account_name` alias must normalize to the same identity within its entry;
conflicting aliases are malformed and shared canonical aliases are duplicates.
A blocked inventory result exits `78` with only
`schemaVersion`, `status`, `reasonCode`, `requiredAccountCount`,
`observedAccountCount`, and `collectionAttempted=false`. Non-exact account sets
use `x_canary.account_set_not_exactly_four`; malformed or unreadable inventory
uses `x_canary.account_inventory_unavailable`.

Every account must contain exactly one unambiguous non-empty auth/CSRF source:
top-level scalars or one supported `cookies`, `cookies_json`, `cookie_jar`, or
`cookieJar` object/list. Auth aliases are `auth_token`, `authToken`, and
`token`; CSRF aliases are `ct0`, `csrf`, and `csrf_token`. Partial sources,
multiple aliases, multiple auth-bearing containers, or top-level credentials
combined with nested credentials are malformed even when their values agree.
A non-empty cookie container without both auth-bearing values (for example,
only `lang`) is also malformed. Auth and CSRF values are both used for
duplicate credential-source detection and are never emitted.

The host runner acquires the production deploy lock, the daily admission lock
with repeated daily-singleton priority probes, its canary lock, and the actual
live Scweet sidecar lock at
`/var/data/social-monitor/runtime/x-collector/scweet_state.db.social-monitor-run.lock`.
It then re-reads and splits the account inventory inside the immutable image
with `--network=none`. Each account runs sequentially in a separate hardened,
bounded-time container with a `0600` one-account cookie fixture on private host
tmpfs and a fresh Scweet database plus distinct sidecar lock on container tmpfs.
The fixed search uses `n_splits=1`, `limit=1`, and a hard two-request daily cap.
Any account failure stops collection before the next account.
Production requires the control directory to be exactly
`/var/data/social-monitor/control`, resolves host tools only from fixed absolute
paths, and runs inventory, collection, validation, and aggregation containers
as fixed non-root UID/GID `65532:65532`. The inherited-directory fixture
capability used by the host tests is not a production CLI option.

Successful evidence uses the allowlisted schema
`x-production-account-canary.v1`. Every account must have one completed Scweet
run, one exactly correlated pass start/success pair, one monotonic state delta,
no failure/auth/rate-limit/cooldown evidence, and a request delta from one to
two. The aggregate rejects reused request, scan, pass, binding, or collector-run
identifiers across accounts. `attribution_status=unknown` is retained as a
warning, not a failure. If all four valid checks fetch zero records, the
aggregate status is `inconclusive_content` and the runner exits `75`.

Safe fixture-only checks (never the real-X test) are:

```sh
python3 -m pytest tests/test_production_canary.py tests/test_production_canary_host.py
bash -n bin/run-production-canary.sh
```
