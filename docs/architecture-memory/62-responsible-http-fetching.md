# Responsible HTTP Fetching

Date: 2026-05-31
Status: baseline responsible fetching memory

## Decision

HTTP/RSS fetching must behave like a responsible aggregator, not an aggressive scraper.

Use conditional requests, per-host concurrency limits, explicit user-agent and source-specific policy.

References:

- Robots Exclusion Protocol RFC 9309: https://www.rfc-editor.org/rfc/rfc9309
- RFC 9111 HTTP Caching: https://www.rfc-editor.org/rfc/rfc9111.html
- RFC 9110 HTTP Semantics: https://www.rfc-editor.org/rfc/rfc9110

## User-Agent

All non-provider HTTP fetching should use a clear User-Agent with contact/project identity where appropriate.

Do not impersonate browsers or platform apps as core architecture.

## Conditional Requests

Use:

```text
ETag
Last-Modified
If-None-Match
If-Modified-Since
304 Not Modified
Cache-Control where relevant
```

## Robots Policy

For generic web/RSS fetching, check robots.txt where applicable.

Notes:

- official APIs have their own terms/rate limits;
- RSS feeds are usually intended for machine consumption, but source-specific policies still matter;
- robots.txt is not an authorization mechanism, but it is a responsible-fetching signal.

## Per-Host Limits

Track:

```text
host
source_type
last_fetch_at
etag
last_modified
failure_count
backoff_until
robots_policy_checked_at
concurrency_limit
```

## Timeouts

Every HTTP fetch has:

- connect timeout;
- read timeout;
- max response size;
- max redirects;
- allowed schemes;
- retry policy.

## Locked Decisions

1. No browser impersonation as core fetching strategy.
2. Conditional HTTP is required for RSS/web fetches.
3. Per-host rate/concurrency limits are required.
4. robots.txt/source policy is considered for generic web fetching.
5. Every fetch has timeouts, size limits and redirect limits.

