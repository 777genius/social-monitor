# 314 - GitHub Acquisition Options 2026

## Last Verified

2026-06-04.

## Sources

- GitHub REST API search: https://docs.github.com/en/rest/search/search
- GitHub REST rate limits: https://docs.github.com/rest/using-the-rest-api/rate-limits-for-the-rest-api
- GitHub webhooks: https://docs.github.com/en/webhooks
- GitHub GraphQL API: https://docs.github.com/en/graphql

## Current Reality

GitHub is a strong B2B/developer monitoring source for issues, repos, code, discussions and mentions.

Official APIs exist, but search endpoints have rate/secondary-limit behavior and result caps that require careful query design.

## Option A - REST Search API

Pros:

- official
- supports repository, code, issues/PRs/users search
- query operators
- good for keyword/brand/dependency monitoring

Cons:

- search-specific rate limits
- secondary rate limits
- result caps
- code search can be expensive/limited

Use for:

- targeted keyword monitoring
- issue/PR mention discovery
- repo discovery

## Option B - GitHub GraphQL Search

Pros:

- flexible fields
- fewer round trips for some shapes
- official

Cons:

- point budget complexity
- still search/result limitations
- schema/version learning cost

Use for:

- richer issue/repo/discussion reads

## Option C - Webhooks / GitHub App

Pros:

- near-real-time for installed repos/orgs
- lower polling load
- strong for tenant-owned GitHub assets

Cons:

- only installed/authorized resources
- not broad public discovery
- app installation flow needed

Use for:

- tenant-owned repo monitoring
- issues/PRs/comments in installed orgs

## Option D - Public Events API

Pros:

- official event stream-ish data
- useful for broad activity sampling

Cons:

- not complete for targeted search
- short retention/window limitations
- noisy

Use only for exploratory signals.

## Option E - Scraping GitHub UI

Pros:

- appears easy

Cons:

- unnecessary because APIs exist
- rate/anti-abuse risk
- brittle

Decision:

- not production path

## Recommended Path

```text
REST/GraphQL search for public discovery
GitHub App webhooks for tenant-owned repos
```

## MVP Implementation Status

Implemented in code:

- source provider key: `github`
- adapter path: `libs/ingestion/adapters/source/github`
- acquisition mode: official REST Search API for public issues
- query mode: `search`
- cursor model: page token
- auth model: optional tenant token through encrypted source config; unauthenticated public search remains supported for low-volume validation
- fixture/live evidence: `npm run check:github-smoke`, `npm run check:source-certification`, optional `npm run check:live-open-connectors`

MVP limitation:

- pull requests are skipped by the issue-search provider until issue/PR content policies are separated.
- GitHub App webhooks are still deferred because they require installation flow and tenant-owned repo scope.

## Architecture Rule

GitHub has two modes: public discovery and installed-app monitoring.

Do not pretend installed webhooks cover the public GitHub universe.
