# RSS/Atom Provider

Provider key: `rss`

RSS/Atom is credentialless, but each source binding must point at a real feed
URL. Use official feeds when possible: product blogs, changelogs, docs feeds,
release feeds, community feeds or trusted publisher feeds.

## Local Setup

No API key or account is required.

Run a focused fixture smoke:

```sh
npm run check:rss-smoke
```

Bind a feed URL:

```json
{
  "providerKey": "rss",
  "config": {
    "feedUrl": "https://hnrss.org/frontpage",
    "maxItems": 20
  }
}
```

## Supported Config

- `feedUrl`, `url` or `query`: primary feed URL. One is required.
- `feedUrls`: optional array of additional feed URLs.
- `extraFeedUrls`: optional array of additional feed URLs.
- `maxItems`: integer from 1 to 100.
- `maxItemAgeHours`: optional freshness filter.

## Safety Rules

- Only `http` and `https` feed URLs are accepted.
- The shared outbound URL policy blocks localhost, private networks,
  link-local ranges, multicast and metadata-service addresses.
- Prefer feeds that publish stable `guid`, canonical links, `ETag` or
  `Last-Modified`.
- Do not use RSS as a page-scraping bypass. If a site does not publish a feed,
  add a new approved provider instead.

## Operational Notes

- No credentials are stored.
- The readiness profile uses a 300 second minimum scan interval and expects
  ETag/Last-Modified cursor behavior where available.
- Raw feed payload retention is disabled unless explicitly approved.

