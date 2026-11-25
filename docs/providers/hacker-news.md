# Hacker News Provider

Provider key: `hacker-news`

Hacker News is the easiest real external source to test. It does not require an
account, API key or OAuth setup. The runtime uses public HN Firebase listings
and HN Algolia search endpoints.

References:

- [Hacker News Firebase API](https://github.com/HackerNews/API)
- [HN Search powered by Algolia - about](https://hn.algolia.com/about)

## Local Setup

No environment variables are required.

Run a focused fixture smoke:

```sh
npm run check:hn-smoke
```

For a real local result, run the app profile from the repo root:

```sh
docker compose --profile app up -d --build
```

Then bind the provider to an interest:

```json
{
  "providerKey": "hacker-news",
  "config": {
    "mode": "search",
    "query": "OpenAI",
    "maxItems": 10
  }
}
```

## Supported Config

- `mode`: `search` or `listing`. Default: `search`.
- `query` or `term`: required for `search`.
- `listing`: one of `top`, `new`, `best`, `ask`, `show`, `job`.
- `maxItems`: integer from 1 to 100.
- `maxItemAgeHours`: optional freshness filter.
- `includeComments`: set to `true` to enrich selected stories with comments.
- `maxCommentedStories` or `maxCommentedPosts`: comment enrichment breadth.
- `maxCommentsPerPost`: comment cap per post.
- `commentDepth`: comment tree depth.
- `scanPasses` or `passes`: advanced multi-pass search/listing config.

## Example Bindings

Search:

```json
{
  "providerKey": "hacker-news",
  "config": {
    "mode": "search",
    "query": "AI agents",
    "maxItems": 25,
    "maxItemAgeHours": 72
  }
}
```

Top listing:

```json
{
  "providerKey": "hacker-news",
  "config": {
    "mode": "listing",
    "listing": "top",
    "maxItems": 30
  }
}
```

## Operational Notes

- No credentials are stored.
- Keep scan interval at 5 minutes or higher. The readiness profile uses a 300
  second minimum interval.
- The provider is fixture-ready; external beta still needs live HTTP and
  rate-limit evidence before claiming live beta readiness.

