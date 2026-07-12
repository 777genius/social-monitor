# GitHub Trending Page Provider

Provider key: `github-trending-page`

This provider reads the public GitHub Trending page and normalizes repository
rank, language, stars and stars-gained signals. Each rank is stored with its
capture time, window, programming-language scope and spoken-language scope. It
does not require a GitHub account or API token.

Reference:

- [GitHub Trending](https://github.com/trending)

## Local Setup

No environment variables are required.

Run focused checks:

```sh
npm run check:github-trending-page-smoke
npm run check:github-trending-page-html-e2e
```

Optional live evidence:

```sh
SOURCE_LIVE_ENVIRONMENT_ID=<non-local-env-id> \
BACKEND_IMAGE_DIGEST=<image-digest> \
BACKEND_GIT_COMMIT_SHA=<40-char-sha> \
SOURCE_LIVE_OPERATOR=<operator> \
npm run capture:live-github-trending-page
```

## Supported Config

- `mode`: must be `listing` when provided.
- `window`, `since` or `query`: one of `daily`, `weekly`, `monthly`, `today`,
  `week`, `month`. Default: `daily`.
- `languages` or `language`: optional language filters.
- `spokenLanguage`: optional spoken-language filter.
- `maxItems`: integer from 1 to 100.
- `maxItemsPerLanguage`: optional per-language cap.
- `userAgent`: optional HTTP user agent override.

## Example Binding

```json
{
  "providerKey": "github-trending-page",
  "config": {
    "window": "daily",
    "languages": ["typescript", "python"],
    "maxItems": 20
  }
}
```

## Operational Notes

- This is a public page parser, not the GitHub REST API.
- Rank is comparable only inside one capture, window and language scope.
- Multi-language scans preserve every repository appearance and select across
  configured scopes by rank round-robin instead of inventing a global rank.
- Parser drift is the main risk. Keep the HTML parser e2e green before relying
  on it for beta evidence.
- The readiness profile uses a 3600 second minimum scan interval.
