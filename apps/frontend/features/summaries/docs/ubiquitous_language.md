# Summaries Ubiquitous Language

## Purpose

Owns workspace summaries, reader review workflow, source coverage and citation
language.

## Core Terms

- Summary: user-facing generated explanation of monitored activity.
- Workspace Summary: the primary summary for the current workspace. It can
  aggregate all relevant posts, source mix, top reads, citations and next
  actions.
- Reader Summary: domain aggregate used by the frontend for the rich workspace
  summary experience. It contains `TopRead`, `SourceMixEntry`, citations,
  quality state and `ReaderAction`.
- Top Read: a user-readable item selected for review. It has a normalized
  `signalScore` plus provider-native `providerMetrics`.
- Signal Score: normalized ranking score owned by Feed/Relevance/Summary
  selection logic. It is not a Reddit score, HN points, GitHub stars or X likes.
- Provider Metric: readable native provider metric such as Reddit score, HN
  points, GitHub stars, X likes, comments or upvote ratio.
- Source Mix: provider coverage summary for the workspace summary.
- Reader Action: explicit action proposed to the user, such as reading a source,
  watching a repository or marking a top read relevant/not relevant.
- Digest: scheduled collection of summaries for a workspace or user.
- ReaderSummary: canonical backend/API term for a workspace-level generated summary
  artifact. Frontend domain/application/presentation must say Summary.
- Insight: notable claim or pattern derived from monitored items.

## Forbidden Synonyms

- Do not expose model provider terms as summary domain language.
- Do not expose ReaderSummary as a separate user-facing concept next to Summary.
- Do not put normalized ranking labels like `Story signal`, `Base signal`,
  `Cross-source support`, `Confirmed by` or `Evidence items` into
  `ProviderMetric[]`.
- Do not let Reddit/HN/GitHub/X scoring rules leak into the Summary context.

## Rename Backlog

- Keep current backend/API `ReaderSummary*` names until the contract can move safely.
- Future target: rename workspace-level readerSummary contract language to
  `WorkspaceSummary` or `ReaderSummary` across backend DTOs, OpenAPI,
  generated_api, mappers and tests.
- Until that migration lands, frontend presentation maps backend ReaderSummary data
  to Summary copy through infrastructure ACL mappers.

## Open Questions

- Which summary confidence and citation states should be hidden on compact
  mobile layouts?
