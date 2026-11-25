# 319 - Forums/Discourse Community Options 2026

## Last Verified

2026-06-04.

## Sources

- Discourse API docs: https://docs.discourse.org/
- Discourse search API examples: https://docs.discourse.org/
- RSS 2.0 specification: https://www.rssboard.org/rss-specification
- Atom RFC 4287: https://datatracker.ietf.org/doc/rfc4287/

## Current Reality

Forums and community sites are high-signal sources for niche products.

Many are Discourse, phpBB, custom forums, Reddit-like boards or sites with RSS/search pages.

## Option A - Discourse API

Pros:

- official for Discourse instances
- structured topics/posts/search
- supports API keys where authorized
- good for support/community forums

Cons:

- per-instance access/policy
- public vs authenticated differences
- rate limits/admin settings vary

Use for:

- known Discourse communities
- tenant-owned forums

## Option B - Forum RSS/Atom Feeds

Pros:

- cheap
- common for topics/categories
- no custom API work

Cons:

- limited metadata
- incomplete comments/replies
- inconsistent feed support

Use for:

- MVP forum monitoring

## Option C - Site Search / HTML Fetch

Pros:

- can cover communities without API/feed

Cons:

- site-specific
- robots/terms review
- parsing and dedupe complexity

Use only with responsible HTTP fetching and explicit site policy review.

## Option D - Managed Web/Forum Data Provider

Pros:

- broad coverage
- fewer custom adapters
- may include forums/reviews/news

Cons:

- cost
- opaque coverage
- vendor compliance review

Use behind provider adapter for scale.

## Recommended Path

```text
known Discourse API where possible
RSS/Atom fallback
managed provider for broad forum coverage
```

## Architecture Rule

Forums are not one source type.

Treat each platform/site family as a capability profile.
