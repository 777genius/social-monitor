# Summaries Context Map

## Owning Context

- `summaries` owns workspace summary, reader summary, citation review, source
  mix, quality state and reader action language.

## Upstream Contexts

- Backend Summary APIs provide generated summaries, canonical ReaderSummary DTOs,
  citations and feedback state.
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
- Map backend/API ReaderSummary terminology to Summary before it reaches
  user-facing presentation copy.
- Summary domain consumes `signalScore` and `providerMetrics`; it must not know
  Reddit score, HN points, GitHub stars or X likes calculation rules.
- `ReaderSummary*Dto -> ReaderSummary` is an anti-corruption mapper until the backend
  REST contract is renamed.
