# 221 - Source RSS/Atom Implementation V1

## Decision

RSS and Atom are first-class V1 sources because they are cheap, open-web friendly, stable and useful for proving ingestion, normalization, dedupe and summarization without platform API lock-in.

RSS/Atom connector is implemented as responsible HTTP fetching, not browser scraping.

## Sources

- RSS 2.0 specification: https://www.rssboard.org/rss-specification
- Atom Syndication Format RFC 4287: https://datatracker.ietf.org/doc/rfc4287/
- HTTP caching RFC 9111: https://www.rfc-editor.org/rfc/rfc9111
- Fetch Metadata request headers: https://www.w3.org/TR/fetch-metadata/

## Supported Formats

V1 supports:

- RSS 2.0
- Atom 1.0
- common namespaces where safely parsed
- feed discovery from explicit URLs only

V1 does not crawl arbitrary websites looking for feeds unless a later feature adds approved discovery.

## Connector Role

```text
RssAtomProviderAdapter
  fetchFeed(url, conditionalHeaders)
  parseFeed(bytes, contentType)
  normalizeEntries(feed)
  persistCursor(etag, lastModified, seenIds)
```

Domain code sees only canonical source items.

## Fetch Policy

Required:

- respect `ETag`
- respect `Last-Modified`
- bounded response size
- timeout
- redirect limit
- SSRF-safe URL validation
- allowed schemes: `https`, optionally `http` for explicitly approved internal/test feeds
- user agent identifying the product and contact URL

Do not hammer feeds. Feed polling interval must be tenant policy plus provider/site backoff.

## Parsing Policy

Use a real XML/feed parser. Do not parse RSS/Atom with regex.

Parser must handle:

- namespaces
- entity decoding
- relative links
- missing dates
- duplicate GUID/link/title combinations
- malformed but common feed variants

Parsing failures become source-visible health issues, not silent data loss.

## Canonical Mapping

RSS/Atom item maps to:

- provider item id: stable GUID/id when available
- canonical URL
- title
- summary/content excerpt
- author when present
- published timestamp
- updated timestamp
- feed URL
- feed title
- enclosure/media references
- raw payload pointer

If GUID is missing, derive identity from normalized link + title + published time with collision handling.

## Dedupe Policy

RSS/Atom often duplicates across:

- mirror feeds
- category feeds
- homepage feeds
- canonical/permalink variants

Use canonical URL first, then normalized title/time hash. Never trust title alone.

## Security

Feed content is untrusted.

Required:

- sanitize HTML before rendering
- never execute feed-provided scripts
- media downloads go through media safety pipeline
- block local/private network URLs
- store raw feed separately with access controls

## Why This Matters

RSS/Atom gives the platform a low-cost ingestion lane for blogs, changelogs, newsletters, docs, product updates and niche communities.

It also provides a fallback source class when commercial social APIs become too expensive or policy-constrained.
