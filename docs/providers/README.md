# Provider Setup Guide

This folder explains how to run Social Monitor against real public sources.
Start here, then open the per-provider file before enabling a source in a
shared or beta environment.

## Fast Path

For a first end-to-end result, start with a source that does not need a user
account or API key:

1. Run the app profile:

   ```sh
   cp .env.example .env
   docker compose --profile app up -d --build
   ```

2. Create an interest, bind one open provider, and request a scan:

   ```sh
   export API_BASE_URL=http://127.0.0.1:3000
   export TENANT_ID=00000000-0000-7000-8000-000000000901
   export WORKSPACE_ID=00000000-0000-7000-8000-000000000902

   curl -sS -X POST "$API_BASE_URL/interests" \
     -H "content-type: application/json" \
     -H "x-tenant-id: $TENANT_ID" \
     -H "x-workspace-id: $WORKSPACE_ID" \
     -H "x-workspace-role: owner" \
     -H "idempotency-key: local-interest-openai" \
     -d '{"name":"OpenAI monitoring","query":"OpenAI developer tools"}'

   curl -sS -X POST "$API_BASE_URL/interests/<interestId>/source-bindings" \
     -H "content-type: application/json" \
     -H "x-tenant-id: $TENANT_ID" \
     -H "x-workspace-id: $WORKSPACE_ID" \
     -H "x-workspace-role: owner" \
     -H "idempotency-key: local-bind-hn-openai" \
     -d '{"providerKey":"hacker-news","config":{"mode":"search","query":"OpenAI","maxItems":10}}'

   curl -sS -X POST "$API_BASE_URL/source-bindings/<sourceBindingId>/scan-requests" \
     -H "x-tenant-id: $TENANT_ID" \
     -H "x-workspace-id: $WORKSPACE_ID" \
     -H "x-workspace-role: owner" \
     -H "idempotency-key: local-scan-hn-openai"
   ```

3. Check status and feed items:

   ```sh
   curl -sS "$API_BASE_URL/scan-requests/<scanJobId>/status" \
     -H "x-tenant-id: $TENANT_ID" \
     -H "x-workspace-id: $WORKSPACE_ID" \
     -H "x-workspace-role: owner"

   curl -sS "$API_BASE_URL/feed/items?limit=20" \
     -H "x-tenant-id: $TENANT_ID" \
     -H "x-workspace-id: $WORKSPACE_ID" \
     -H "x-workspace-role: owner"
   ```

Replace `<interestId>`, `<sourceBindingId>` and `<scanJobId>` with ids returned
by the previous calls. The app profile includes the API, ingestion worker,
Postgres and RabbitMQ, so manual scan requests can be processed by the worker.

## Provider Matrix

| Provider key | Setup needed | Best first use | Status |
| --- | --- | --- | --- |
| `hacker-news` | None | Fastest real external signal | Enabled beta, fixture-ready |
| `rss` | A public RSS/Atom feed URL | Official blogs, changelogs, news feeds | Enabled beta, fixture-ready |
| `github-trending-page` | None | Public GitHub Trending repository signals | Enabled beta, fixture-ready |
| `github-repo-radar` | Google Cloud BigQuery project for full live mode | Repository trend analysis | Enabled beta, fixture-ready |
| `github-issues` | Optional GitHub token, beta flag required in beta runtime | Public GitHub issue search | Manual-only |
| `reddit` | Real Reddit app credentials or tenant OAuth credential | Subreddit and Reddit search monitoring | Enabled beta, fixture-ready |
| `x-twitter` | Private x-collector plus dedicated research accounts | X/Twitter daily search | Provider-only, deferred unless configured |
| `telegram` | No runtime provider currently | Do not enable yet | Deferred |

## Open Providers

These do not require API keys for a local first result:

- [Hacker News](hacker-news.md)
- [RSS/Atom](rss.md)
- [GitHub Trending Page](github-trending-page.md)

Credentialless live certification can be captured with:

```sh
SOURCE_LIVE_ENVIRONMENT_ID=<non-local-env-id> \
BACKEND_IMAGE_DIGEST=<image-digest> \
BACKEND_GIT_COMMIT_SHA=<40-char-sha> \
SOURCE_LIVE_OPERATOR=<operator> \
npm run capture:live-open-connectors
```

That command is for live evidence, not for the normal local quick start.

## Credentialed Providers

- [Reddit](reddit.md) needs OAuth credentials. Use app-only credentials for
  shared runtime defaults, or tenant refresh-token credentials for tenant-owned
  access.
- [GitHub Repo Radar](github-repo-radar.md) needs a Google Cloud project when
  using GH Archive through BigQuery.
- [GitHub Issues](github-issues.md) can query public issues without a token, but
  a token is recommended for rate-limit headroom. It is disabled by default in
  beta unless `GITHUB_ISSUES_COLLECTOR_ENABLED=1`.

## Deferred Or Private Providers

- [X/Twitter](x-twitter.md) is available only through the private `x-collector`
  service and must use dedicated research accounts, not personal accounts.
- [Telegram](telegram.md) has architecture notes, but no bindable runtime
  provider in the current codebase.

## Runtime Notes

- `SOCIAL_MONITOR_RUNTIME_PROFILE=beta` excludes fixture-only providers and
  keeps manually gated providers behind flags.
- Do not put secrets in source binding JSON unless the field is explicitly
  supported and the runtime secret boundary is enabled. Prefer env or the source
  credential flow for shared environments.
- Provider live checks are intentionally separate from `npm run verify` because
  they can call external services and may require real accounts.

