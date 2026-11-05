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

## Configured interest authority for promotion

Every new `reader_post_promotion` ranking invocation reads current Monitoring
configuration independently, once per tenant/workspace/interest represented in
its primary and supplemental snapshot. This also applies to an explicitly
requested replacement generation for an older window. The content/engagement
cutoff does not reconstruct historical interest configuration. Different
interests are separate reads, not a transactionally consistent configuration
snapshot. A later invocation may see an edited query.

`ConfiguredInterestReaderPort` is a narrow Relevance capability backed by the
existing scoped Monitoring repository. Missing/deleted, unavailable and
mismatched authority return `operation.conflict`; an omitted capability never
falls back to provider metadata or no-topic ranking. Monitoring archive removes
the row from ordinary reads through `deletedAt`; disabled, nondeleted interests
retain the repository's existing readable semantics.

Configured query is intent, including literal short queries, not a claim of
human authorship. Promotion projects that independently resolved query into the
existing quality policy's literal `query` input. Stored interest snapshots,
source-query modes/descriptors and copied top-level query fields are not
promotion topic authority. Legitimate GitHub native `topics` remain provider
content. Primary canonical native metrics, supplemental native fields, safety,
crypto and admission floors retain their existing policies.

Immutable publication recovery must consume its captured evidence and output;
it must not invoke this current-configuration capability. Frozen daily
`output_text` recovery returns before constructing a ranker. Legacy recovery
without sufficient captured evidence cannot silently use today's configuration:
it fails closed. Current intent is not a historical revision, and new ranking
results must never overwrite an existing publication's bytes, IDs or hashes.
