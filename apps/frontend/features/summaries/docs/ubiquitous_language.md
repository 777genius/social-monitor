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
- Promotion Attestation: the backend-signed-by-contract authorization carried
  by every Promotion Policy V1 Top or Additional card. The frontend accepts
  only the known schema, policy and digest versions, verifies the SHA-256
  digest, and requires placement and decision to agree with the card lane.
  Missing, malformed, unknown or contradictory attestations fail closed.
- Additional Notable Story: an existing story cluster outside the curated Top
  Reads that the backend explicitly authorizes after applying provider-native
  notability policy. It appears at most once, carries its story-cluster id,
  aggregates the cluster's citations and providers, and may be absent. The UI
  preserves server order and neither guesses eligibility nor sorts by
  normalized Signal. Unmarked legacy `selectedPosts`, including GitHub items,
  are unsupported and fail closed. Only legacy `topReads` may use list-context
  fallback for backward-compatible classification.
- Related Topic: a non-transitive, non-credit card for one selected subject
  story that the backend explicitly relates to a distinct official-authority
  target story. It keeps the subject cluster id, stable relation id and target
  cluster id, and displays only the subject source's title, URL, citation,
  provider metrics and score. Noncanonical kinds or relation identity versions,
  missing markers, raw or normalized duplicate identities, self-referencing
  targets and dangling targets fail closed; presentation never infers or
  traverses a relation.
- Top Read Feedback Target: the concrete feed/source item identity used when a
  user rates a Top Read with 1-5 stars. It is recorded for review learning
  only and must not directly reorder results until a capped ranking policy
  explicitly consumes it.
- Signal Score: normalized ranking score owned by Feed/Relevance/Summary
  selection logic. It is not a Reddit score, HN points, GitHub stars or X likes.
- Provider Metric: readable native provider metric such as Reddit score, HN
  points, GitHub stars, X likes, comments or upvote ratio.
- Source Mix: provider coverage summary for the workspace summary.
- Reviewed Post: a unique collected feed item that was available to Summary
  selection for the covered period. It is not a raw provider response or a
  repeated sighting of the same post.
- Used in Summary: a Reviewed Post selected as Summary evidence.
- Not Selected: a Reviewed Post that was available but was not used in the
  Summary. This does not by itself mean that the post was spam, irrelevant or
  low quality.
- Trust & evidence: compact reader-facing summary of confidence, monitored
  source-group diversity, citations and reliability risks for a Summary. It
  opens the cited evidence details, hides raw internal scores from users and
  must not present itself as a generic truth oracle.
- Reader Action: explicit action proposed to the user, such as reading a source,
  watching a repository or marking a top read relevant/not relevant.
- Digest: scheduled collection of summaries for a workspace or user.
- Rolling Summary: mutable current-day view served through immutable revisions.
  A new revision may replace the visible revision after each scheduled
  collection, but it never changes a finalized Daily Summary.
- Final Daily Summary: the immutable closed-day Summary produced after the UTC
  day ends. It is authoritative for historical navigation.
- Summary Refresh Schedule: the user-visible collection cadence. The latest
  Summary shows when its evidence was collected and the next scheduled refresh.
- Weekly Summary Projection: Monday-Sunday summary surface whose artifact is
  displayable only when the REST projection is complete and certified.
- Historical Evidence Limitation: explicit disclosure that named provider
  evidence was not captured for a certified UTC date. `historical_unavailable`
  never authorizes replacement evidence, inferred activity or hidden artifact
  display.
- ReaderSummary: canonical backend/API term for a workspace-level generated summary
  artifact. Frontend domain/application/presentation must say Summary.
- Insight: notable claim or pattern derived from monitored items.

## Forbidden Synonyms

- Do not expose model provider terms as summary domain language.
- Do not expose ReaderSummary as a separate user-facing concept next to Summary.
- Do not put normalized ranking labels like `Story signal`, `Base signal`,
  `Cross-source support`, `Confirmed by` or `Evidence items` into
  `ProviderMetric[]`.
- Provider-native Additional Notable Story floors belong to the backend Summary
  policy. Flutter must consume the authorized card kind and must never infer
  Additional authority from metrics, source copy or provider identity. Only
  exact `topReads` list context may provide backward-compatible fallback for
  unmarked legacy items; `selectedPosts` never receive that fallback,
  regardless of provider identity.
- Related Topic authority and direction belong to the backend domain. Flutter
  must never infer a relation from titles, providers, metrics or a negative
  same-story decision.
- Promotion Policy V1 thresholds, ranking and refill decisions belong to the
  backend. Flutter preserves authorized server order, applies only the eight
  item lane caps and canonical deduplication with Top winning, and accepts
  short or empty lanes.

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
