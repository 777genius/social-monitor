# 392 - Source Token Setup Minimal Permissions 2026

## Last Verified

2026-06-20.

## Sources

- GitHub fine-grained token permissions: https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens
- GitHub personal access token management: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
- Reddit OAuth2 guide: https://github.com/reddit-archive/reddit/wiki/oauth2
- X OAuth 2.0 Authorization Code Flow with PKCE: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
- X API v2 authentication mapping: https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping
- X API pay-per-usage pricing: https://docs.x.com/x-api/getting-started/pricing
- X API rate limits: https://docs.x.com/x-api/fundamentals/rate-limits

## Rule

Source credentials are never committed and never written to release artifacts.

Use operator shell env, approved secret storage, or encrypted source credential storage only. Evidence capture may write redacted artifact paths, hashes, scopes, provider health and rate-limit metadata, but not token values.

## GitHub

Default posture:

- public source monitoring should run without a GitHub token when rate limits are acceptable;
- if a token is needed, use a fine-grained personal access token or a GitHub App installation token;
- prefer GitHub App for multi-tenant or org-owned beta usage.

Minimal fine-grained PAT setup:

- resource owner: only the owner that contains the target repositories;
- repository access: only selected repositories, unless public-only monitoring is intentionally selected;
- expiration: short, normally 30 to 90 days for beta evidence;
- repository permissions: read-only only;
- required for current issue/search adapter: no write permissions;
- add `Contents: read` only if private repo metadata, files, releases or code-backed evidence are required;
- add `Issues: read` only if private issue search needs authenticated access;
- add `Pull requests: read` only if PR-specific private metadata is needed;
- do not grant Actions, Administration, Workflows, Deployments, Secrets, Environments or write permissions.

Runtime variables:

```text
GITHUB_ACCESS_TOKEN
```

Release evidence must record:

- token kind, not token value;
- selected repository policy;
- expiration policy;
- observed rate-limit headers;
- auth failure behavior.

## Reddit

Default posture:

- Reddit beta evidence requires tenant-owned OAuth credentials;
- current backend capture accepts either `REDDIT_ACCESS_TOKEN` or `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` + `REDDIT_REFRESH_TOKEN`;
- prefer refresh-token flow for repeatable staging evidence;
- keep raw refresh/access tokens only in operator shell or secret storage.

App type:

- for controlled server-side beta smoke, use a Reddit app type that can keep a secret;
- for end-user tenant connection later, use the OAuth flow that matches the product connection model;
- never ask users for Reddit passwords.

Minimal scopes:

- use `read` for listing/searching public posts;
- add `identity` only when the smoke explicitly calls account identity endpoints;
- do not request submit, vote, privatemessages, mod scopes or broad wildcard scopes for monitoring.

Runtime variables:

```text
REDDIT_CLIENT_ID
REDDIT_CLIENT_SECRET
REDDIT_REFRESH_TOKEN
REDDIT_ACCESS_TOKEN
REDDIT_USER_AGENT
```

Release evidence must record:

- granted scopes, redacted;
- credential owner class, tenant or operator;
- token exchange success/failure;
- expired/invalid token failure classification;
- rate-limit and retry behavior;
- credential lifecycle artifact hash.

## X/Twitter

Default posture:

- X/Twitter remains deferred for beta until direct paid API or approved vendor access is accepted;
- no browser login automation, scraper-first flow, private endpoint use or anti-bot bypass is production-safe;
- support X as a replaceable adapter, not as a core dependency.

Direct X API read-only minimum:

- use OAuth 2.0 for X API v2;
- base read scopes for user/tweet lookup are `tweet.read users.read`;
- add `offline.access` only when refresh tokens are required for repeated background scans;
- add `follows.read`, `list.read`, `like.read`, `space.read` or other scopes only for explicitly enabled features;
- never request write scopes for monitoring-only MVP.

Commercial gate:

- X API uses pay-per-usage credits and endpoint-specific costs;
- rate limits are endpoint-specific and must be captured from response headers;
- every X binding must have tenant entitlement, monthly spend cap, scan interval floor, retention policy and deletion policy before enablement.

Approved adapter options:

```text
XProviderAdapter -> DirectXApiAdapter
XProviderAdapter -> LicensedVendorXAdapter
XProviderAdapter -> DisabledDeferredAdapter
```

Release evidence must record:

- adapter type;
- approved access path;
- scopes and endpoint list;
- cost estimate and spend cap;
- rate-limit headers;
- deletion/retention obligations;
- fallback behavior when X is disabled.

## Operator Flow

1. Create credentials outside the repo.
2. Store credentials in approved secret storage or a private shell session.
3. Export only the env vars needed for the evidence command.
4. Run the live capture command.
5. Validate redaction and evidence hashes.
6. Rotate or revoke test credentials after evidence capture when they are no longer needed.

## Do Not Do

- Do not paste tokens into docs, issues, commits, screenshots, logs or release evidence.
- Do not use classic broad GitHub PATs unless a documented endpoint gap forces it.
- Do not use Reddit password grant for tenant-owned production connections.
- Do not enable X/Twitter through browser automation or unofficial scraping in beta.
- Do not expand provider scopes to "fix" a 403 without mapping the endpoint requirement first.
