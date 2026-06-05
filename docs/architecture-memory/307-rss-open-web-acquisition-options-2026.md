# 307 - RSS/Open Web Acquisition Options 2026

## Last Verified

2026-06-04.

## Sources

- RSS 2.0 specification: https://www.rssboard.org/rss-specification
- Atom RFC 4287: https://datatracker.ietf.org/doc/rfc4287/
- HTTP caching RFC 9111: https://www.rfc-editor.org/rfc/rfc9111
- Google Alerts: https://www.google.com/alerts

## Current Reality

RSS/Atom/open-web monitoring is still one of the cheapest and most reliable acquisition lanes.

It is especially useful for blogs, product changelogs, docs, news, forums and community sites that expose feeds.

## Option A - Direct RSS/Atom Feeds

Pros:

- open standard
- cheap
- stable
- good metadata
- supports conditional fetching

Cons:

- not all sites provide feeds
- inconsistent formatting
- no social engagement metrics unless included

Use early.

## Option B - Feed Discovery From Known Sites

Pros:

- improves onboarding
- useful for websites with linked feeds

Cons:

- needs SSRF safety
- HTML parsing complexity
- discovery can be stale

Use later with allowlisted URL validation.

## Option C - Google Alerts / Search Alerts

Pros:

- simple
- can discover web mentions
- useful for personal MVP

Cons:

- not an API product contract
- limited export/control
- search ranking/coverage opaque

Use as manual/import or optional personal integration, not core product truth.

## Option D - Web Crawling

Pros:

- broad coverage

Cons:

- robots/policy/compliance complexity
- expensive
- duplicate detection hard
- not needed for MVP

Use only with responsible crawling policy and clear scope.

## Option E - Browser Scraping

Pros:

- can reach pages without feeds

Cons:

- brittle
- not scalable
- legal/robots/policy risk

Decision:

- avoid for product core

## Recommended Path

MVP:

```text
explicit RSS/Atom feed URLs + conditional HTTP fetching
```

Later:

```text
feed discovery + managed web/news data providers
```

## Architecture Rule

Open web sources are valuable because they are boring.

Keep them boring: fetch responsibly, parse safely and avoid crawler sprawl.
