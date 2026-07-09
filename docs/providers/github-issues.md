# GitHub Issues Provider

Provider key: `github-issues`

Legacy alias: `github`

This provider searches public GitHub issues through the GitHub REST API. It is
manual-only and disabled by default in beta runtime.

References:

- [GitHub REST API](https://docs.github.com/en/rest)
- [GitHub REST API authentication](https://docs.github.com/rest/overview/authenticating-to-the-rest-api)
- [GitHub REST API rate limits](https://docs.github.com/rest/using-the-rest-api/rate-limits-for-the-rest-api)

## Enablement

In `SOCIAL_MONITOR_RUNTIME_PROFILE=beta`, enable the provider explicitly:

```sh
GITHUB_ISSUES_COLLECTOR_ENABLED=1
```

Local-dev runtime includes it unless the runtime scope filters it out.

## Credentials

Public issue search can run without a token, but GitHub has much lower
unauthenticated rate limits. For sustained usage, provide a token through the
source binding config or a future credential boundary:

```json
{
  "providerKey": "github-issues",
  "config": {
    "query": "repo:openai/codex bug is:issue",
    "accessToken": "<do-not-commit>",
    "userAgent": "social-monitor-local"
  }
}
```

Do not commit tokens or put them in shared docs/fixtures. In shared runtime,
prefer a secret boundary over inline config.

## Supported Config

- `mode`: must be `search` when provided.
- `query` or `term`: required GitHub issue search query.
- `maxItems`: integer from 1 to 100.
- `accessToken`, `apiToken` or `bearerToken`: optional token.
- `userAgent`: optional HTTP user agent override.

## Example Binding

```json
{
  "providerKey": "github-issues",
  "config": {
    "query": "repo:openai/codex is:issue is:open",
    "maxItems": 25
  }
}
```

## Operational Notes

- This provider uses the official REST API, not GitHub UI scraping.
- GitHub search has its own rate-limit behavior separate from some other REST
  endpoints.
- Keep this manual-only until live API rate-limit evidence and beta scope
  policy are approved.

