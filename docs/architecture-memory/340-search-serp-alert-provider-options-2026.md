# 340 - Search/SERP Alert Provider Options 2026

## Last Verified

2026-06-04.

## Sources

- Google Alerts help: https://support.google.com/websearch/answer/4815696
- Google Custom Search JSON API: https://developers.google.com/custom-search/v1/introduction
- DataForSEO SERP API: https://dataforseo.com/apis/serp-api/
- DataForSEO APIs: https://dataforseo.com/apis
- SerpApi Google Search API: https://serpapi.com/search-api
- SerpApi legal docs: https://serpapi.com/legal

## Current Reality

SERP/search-alert providers are useful for web mention discovery, but they are not social network APIs.

They find indexed pages. They do not guarantee complete platform coverage or comments/replies.

## Option A - Google Alerts

Pros:

- free/simple
- useful for personal MVP
- email delivery

Cons:

- no robust product API
- opaque ranking/freshness
- manual setup
- limited automation/control

Use for:

- personal/manual monitoring fallback

## Option B - Google Custom Search JSON API

Pros:

- official Google API
- structured JSON
- useful for programmable search engines

Cons:

- not full general-web monitoring by default
- setup and availability constraints
- quotas/cost
- product direction can change

Use only for scoped site/search experiences.

## Option C - SERP API Provider

Examples:

- SerpApi
- DataForSEO
- HasData
- Bright Data SERP products

Pros:

- fast web mention discovery
- Google/Bing/News/Images/Shopping variants
- structured results
- less crawler maintenance

Cons:

- legal/terms diligence required
- provider cost
- search-result ranking opacity
- not source truth

Use behind:

```text
SearchDiscoveryProviderPort
```

## Option D - Own Search Crawler

Pros:

- maximum control

Cons:

- expensive
- robots/politeness/legal complexity
- massive dedupe/indexing burden
- not MVP-friendly

Decision:

- not MVP path

## Recommended Path

```text
RSS/API first
SERP provider as discovery adapter for web mentions
```

## Architecture Rule

SERP finds candidate URLs.

Canonical content still comes from source-specific fetch/normalization when allowed.
