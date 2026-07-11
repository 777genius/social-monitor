# Reddit Provider

Provider key: `reddit`

Reddit requires OAuth for real external data. The provider supports app-only
runtime credentials and tenant-owned credential overrides.

Reference:

- [Reddit OAuth2 guide](https://www.reddit.com/r/redditdev/wiki/oauth2/)

## Choose Credential Mode

Use one of these modes:

1. App-only credentials for shared local/beta runtime.
2. Tenant refresh-token credentials for tenant-owned access.
3. Short-lived access token only for live smoke/evidence, not for durable use.

## App-Only Setup

Create a Reddit app from the Reddit developer app settings. Use a dedicated
Reddit account owned by the team or tenant, not a personal throwaway account.

Set runtime env:

```sh
REDDIT_APP_CLIENT_ID=<client-id>
REDDIT_APP_CLIENT_SECRET=secret-token
REDDIT_APP_USER_AGENT=social-monitor-mvp/0.1 reddit-app-only
```

The provider exchanges these for app-only access tokens at runtime.

## Tenant Refresh-Token Setup

Use the local helper to obtain a refresh token through a browser approval flow:

```sh
export REDDIT_CLIENT_ID=<client-id>
export REDDIT_CLIENT_SECRET=<client-secret>
export REDDIT_USER_AGENT="social-monitor-mvp/0.1 local-oauth"
export REDDIT_OAUTH_REDIRECT_URI=http://127.0.0.1:8765/reddit/oauth/callback

npm run reddit:oauth:local-callback
```

Configure the exact redirect URI in the Reddit app settings. The helper writes
a private env file under `/tmp/social-monitor-evidence` by default and does not
print secret values.

Then capture live Reddit evidence:

```sh
set -a
. /tmp/social-monitor-evidence/reddit-oauth-secret.env
set +a
npm run capture:live-reddit-oauth
```

## Supported Binding Config

- `mode`: `search` or `listing`. Default: `search`.
- `query` or `term`: required for `search`.
- `subreddit` or `query`: required for `listing`.
- `listing`: one of `hot`, `new`, `top`, `rising`. Default: `hot`.
- `topTime`: optional top listing time window.
- `searchSort`, `searchTime`: optional Reddit search controls.
- `maxItems`: integer from 1 to 100.
- `minScore`: optional score floor.
- `includeComments`: set to `true` to enrich selected posts with comments.
- `maxCommentsPerPost`, `maxCommentedPosts`, `commentDepth`, `commentSort`:
  comment enrichment controls.
- `targetPublishedWindow`: optional published-time window.
- `accessToken`, `apiToken` or `bearerToken`: short-lived override.
- `refreshToken` or `redditRefreshToken` plus `clientId` or `redditClientId`:
  tenant refresh-token override.
- `clientSecret` or `redditClientSecret`: optional depending on Reddit app type.
- `userAgent`: optional request user agent.

## Example Bindings

Subreddit listing:

```json
{
  "providerKey": "reddit",
  "config": {
    "mode": "listing",
    "subreddit": "programming",
    "listing": "hot",
    "maxItems": 25
  }
}
```

Search:

```json
{
  "providerKey": "reddit",
  "config": {
    "mode": "search",
    "query": "OpenAI developer tools",
    "searchSort": "relevance",
    "maxItems": 25
  }
}
```

## Checks

Fixture smoke:

```sh
npm run check:reddit-smoke
```

Live OAuth smoke:

```sh
npm run check:live-reddit-oauth
```

## Operational Notes

- Missing Reddit OAuth credentials fail closed. The provider will not fall back
  to scraping.
- Keep Reddit secrets out of tracked files and screenshots.
- Respect subreddit rules, Reddit API policy, rate limits and tenant consent.
- The readiness profile uses a 900 second minimum scan interval.
