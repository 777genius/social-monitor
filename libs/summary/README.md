# Summary Context

Owns generated summaries, reader summaries, citations, summary quality,
reader actions, evaluation policy and summary delivery contracts.

## Ubiquitous Language

- `ReaderSummary`: rich workspace summary aggregate for reader-facing review.
- `TopRead`: selected story/read with normalized `signalScore`,
  provider-native `providerMetrics`, citations and next actions.
- `SourceMixEntry`: provider coverage for the current summary window.
- `ReaderAction`: action suggested to the user after reading a summary.
- `ReaderSummaryScope`, `ReaderSummaryPolicy`, `ReaderSummaryJob`: canonical
  domain names for reader-summary request scope, generation policy and job
  lifecycle.
- `Briefing*`: legacy REST/API persistence language. Keep it behind
  compatibility factories, persistence and REST ACLs until full API rename.
  New domain logic must be added to `ReaderSummary*` types first.

## Context Rules

- Summary receives normalized `SignalScore` and readable `ProviderMetric[]`.
- Summary does not know how Reddit, Hacker News, GitHub or X calculate native
  popularity.
- Provider-native metrics are labels such as Reddit score, HN points, GitHub
  stars, X likes, comments and upvote ratio.
- Do not emit normalized ranking labels such as `Story signal`, `Base signal`,
  `Cross-source support`, `Confirmed by` or `Evidence items` as provider
  metrics.
- Feed/Relevance select and normalize signal; Summary explains and packages the
  selected signal for readers.

Layout is fixed as:

- `domain`
- `features`
- `ports`
- `adapters`
- `interfaces`
