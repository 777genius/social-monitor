# 302 - Social Source Acquisition Option Taxonomy

## Last Verified

2026-06-04.

## Decision

Every social source adapter must classify its acquisition mode.

This prevents mixing official APIs, partner firehoses, managed data providers, open-web feeds and unsupported scraping into one vague "scanner" concept.

## Source Acquisition Modes

```text
official_api
official_stream_or_firehose
official_partner_data
owned_connected_profile
research_api
open_protocol
rss_atom_open_web
managed_data_provider
manual_import
unsupported_scraping
```

## Option Matrix

### Official API

Pros:

- strongest compliance posture
- stable auth model
- documented rate limits/errors
- best long-term maintainability

Cons:

- approval/friction
- limited endpoints
- pricing/quotas
- changing access tiers

Use when available.

### Official Stream/Firehose

Pros:

- best completeness
- low polling delay
- enterprise-grade coverage

Cons:

- expensive
- usually partner/enterprise only
- high ingestion volume
- strong contractual constraints

Use later for high-value paid tiers.

### Official Partner Data

Pros:

- reliable coverage without building all provider relationships
- may include historical access
- terms clearer than scraping

Cons:

- vendor lock-in
- per-source/package pricing
- sometimes black-box coverage
- DPA/subprocessor governance needed

Use as replaceable provider adapter.

### Owned/Connected Profile

Pros:

- good for tenant-owned accounts/pages/channels
- often allowed by platform APIs
- useful for comments, mentions, inbox, publishing workflows

Cons:

- not broad public listening
- requires tenant OAuth/admin access
- permissions review
- misses competitor/public conversations

Use for tenant-owned monitoring.

### Research API

Pros:

- official public data path for academic/non-commercial research
- may expose search/comments

Cons:

- eligibility restrictions
- not commercial-safe by default
- data gaps/limits
- publication/retention terms

Use only when product purpose qualifies.

### Open Protocol

Pros:

- documented protocol
- easier self-host/federated ingestion
- no single commercial platform gate

Cons:

- fragmented instances
- per-instance policies/rate limits
- moderation/deletion propagation complexity

Use for Bluesky/ATProto, Mastodon/ActivityPub where valuable.

### RSS/Atom/Open Web

Pros:

- cheap
- robust
- good for blogs/news/docs/forums with feeds

Cons:

- inconsistent metadata
- no social metrics unless included
- not all platforms expose feeds

Use early.

### Managed Data Provider

Pros:

- fast integration
- abstracts source-specific changes
- may provide many platforms

Cons:

- compliance diligence required
- coverage may be undocumented
- pricing can scale badly
- provider can disappear/change methods

Use behind provider adapter only.

### Unsupported Scraping

Pros:

- can appear to fill API gaps

Cons:

- high breakage
- anti-bot friction
- legal/terms risk
- account/IP bans
- poor enterprise posture
- not reliable at scale

Do not use as product architecture path.

## Architecture Rule

The adapter must declare acquisition mode before it ships.

If the mode is unsupported scraping, it is a research spike at most, not production architecture.
