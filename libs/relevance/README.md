# Relevance Context

Owns user relevance feedback, user relevance profile, ranking policy and memory
projection for personalization.

## Ubiquitous Language

- `FeedbackSignal`: user action captured as durable learning input.
- `UserRelevanceProfile`: source of truth for learned user preferences.
- `RankingPolicy`: rules that score feed items using feed signal plus user
  profile.
- `RelevanceMemoryProjection`: async projection of durable feedback/profile
  state into memory infrastructure for LLM context.

## Context Rules

- Database profile and feedback records remain the source of truth.
- Feed provider-native metrics are translated at the application boundary into
  `RankingCandidate.sourceSignalScore`; Relevance domain does not import Feed
  provider metric models.
- Memory projection is async personalization context, not the primary write
  model.
- Summary can request personalized context through application ports/use cases,
  but must not write memory directly.

Layout is fixed as:

- `domain`
- `features`
- `ports`
- `adapters`
- `interfaces`
