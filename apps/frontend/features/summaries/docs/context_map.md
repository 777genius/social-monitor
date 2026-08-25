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
- Summary domain consumes `signalScore` and `providerMetrics`; it must not know
  Reddit score, HN points, GitHub stars or X likes calculation rules.
- Production scheduling owns the four-hour collection cadence. Presentation may
  project that stable schedule as freshness copy, but it must not trigger or
  claim completion of a backend collection.
- Rolling Summary revisions and Final Daily Summaries share the same reader
  layout. The latest revision is selected by the backend publication boundary;
  historical Final Daily Summaries remain immutable.
- `ReaderSummary*Dto -> ReaderSummary` is an anti-corruption mapper until the backend
  REST contract is renamed.
