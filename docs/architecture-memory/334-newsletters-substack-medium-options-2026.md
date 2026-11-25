# 334 - Newsletters/Substack/Medium Options 2026

## Last Verified

2026-06-04.

## Sources

- Substack RSS support: https://support.substack.com/hc/en-us/articles/360038239391-Is-there-an-RSS-feed-for-my-publication
- Medium RSS support: https://help.medium.com/hc/en-us/articles/214874118-Using-RSS-feeds-of-profiles-publications-and-topics
- RSS 2.0 specification: https://www.rssboard.org/rss-specification
- Atom RFC 4287: https://datatracker.ietf.org/doc/rfc4287/

## Current Reality

Newsletters and long-form platforms are high-signal for market narratives and competitor thought leadership.

Substack and Medium support RSS feeds, making RSS/open-web acquisition the best default.

## Option A - Native RSS/Atom Feeds

Pros:

- official/help-documented for Substack and Medium
- cheap
- stable enough for MVP
- good for watchlists
- often includes substantial content

Cons:

- no full social interaction graph
- paid/subscriber-only content not available in public feed
- Medium feed limits/pagination constraints may apply
- comments/discussions may not be covered

Use for:

- known newsletters/publications/authors/topics

## Option B - Feed Discovery

Pros:

- easy onboarding from URL
- supports custom domains
- works for Ghost/Beehiiv/WordPress too

Cons:

- needs SSRF and redirect safety
- platform-specific feed patterns
- feed can disappear after migration

Use with responsible URL validation.

## Option C - Newsletter Inbox Integration

Pros:

- monitors subscribed emails
- can include private/subscriber newsletters if user consents

Cons:

- privacy/security risk
- email provider integration complexity
- strong consent required
- not MVP-friendly

Use only with explicit user-controlled mailbox integration later.

## Option D - Scraping

Pros:

- may access pages not in feed

Cons:

- unnecessary for most public posts
- paywall/private-content risk
- brittle

Decision:

- avoid as default

## Recommended Path

```text
RSS/feed discovery first
email inbox ingestion only as future explicit-user integration
```

## Architecture Rule

Newsletter monitoring is open-web/RSS monitoring unless the user explicitly connects a private inbox.
