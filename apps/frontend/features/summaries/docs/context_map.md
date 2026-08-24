# Summaries Context Map

## Owning Context

- `summaries` owns workspace summary, reader summary, citation review, source
  mix, quality state and reader action language.

## Upstream Contexts

- Backend Summary APIs provide generated summaries, canonical ReaderSummary DTOs,
  citations, weekly certification presence, historical evidence limitations and
  feedback state.
- Feed provides selected feed items, normalized signal score and provider-native
  metrics.
- Relevance provides learning feedback state and user relevance profile effects.
- Ingestion/Monitoring provide source coverage, source binding and scan policy
  facts through backend contracts.

## Downstream Contexts

- Settings may configure summary preferences through backend contracts.
- Memory may personalize future summaries through backend relevance/memory
  projections. Frontend does not talk to memory directly.

## Integration Rules

- Do not import feed or settings feature packages directly.
- Keep generated summary DTOs and provider-specific language in infrastructure.
- Map weekly projection status, active-artifact presence and evidence limitations
  into sealed Summary domain state; partial and unavailable projections suppress
  artifact payloads before presentation.
- Map backend/API ReaderSummary terminology to Summary before it reaches
  user-facing presentation copy.
- Until a regenerated transport adds dedicated reader-card fields, REST carries
  the same contract through reserved `reader-card-kind:` and
  `reader-story-cluster:` entries in the existing `matchedRules` array.
  Related Topic cards additionally require exactly one
  `reader-related-topic-relation:` and `reader-related-topic-target:` marker.
  The infrastructure mapper accepts only canonical card kinds and canonical
  `related-topic:v1` identities, consumes those entries before
  domain/presentation use, rejects raw or normalized identity collisions across
  the full reader brief, and validates both clusters against the artifact
  cluster set.
- Summary domain consumes mapped `signalScore` and `providerMetrics`, never raw
  provider payloads. It trusts the backend's explicit story-cluster identity
  and authorized card kind; it does not reinterpret provider metrics to decide
  whether an Additional Notable Story is eligible.
- Promotion Policy V1 cards cross the REST boundary with a typed promotion
  attestation. The infrastructure anti-corruption layer verifies the exact
  schema, policy, digest version and SHA-256 digest before mapping it. The
  presentation projection checks placement/decision agreement, preserves
  server order, caps each lane at eight and deduplicates canonical identities
  with Top taking precedence. It never reconstructs thresholds, reranks or
  refills a lane.
- Production scheduling owns the four-hour collection cadence. Presentation may
  project that stable schedule as freshness copy, but it must not trigger or
  claim completion of a backend collection.
- Rolling Summary revisions and Final Daily Summaries share the same reader
  layout. The latest revision is selected by the backend publication boundary;
  historical Final Daily Summaries remain immutable.
- `ReaderSummary*Dto -> ReaderSummary` is an anti-corruption mapper until the backend
  REST contract is renamed.
