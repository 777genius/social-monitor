# Feed Context

Owns deduplicated feed items, feed signals, provider-native metrics,
provenance and read models used by downstream ranking/summary contexts.

## Ubiquitous Language

- `FeedItem`: normalized readable item projected from ingestion source items.
- `FeedSignal`: feed-level signal derived from score, recency, source and
  cohort baselines.
- `ProviderMetrics`: native metrics from the provider, such as Reddit score,
  HN points, GitHub stars, X likes, comments and upvote ratio.
- `FeedNormalizedSignal`: normalized score that downstream contexts may use
  without knowing provider-specific popularity rules.

## Context Rules

- Feed owns provider-native metric interpretation.
- Summary may display provider metrics but must not recalculate their meaning.
- Relevance may rank feed items using feed signals and user relevance profile.

Layout is fixed as:

- `domain`
- `features`
- `ports`
- `adapters`
- `interfaces`
