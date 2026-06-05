# Translation Policy

Date: 2026-05-31
Status: baseline translation memory

## Decision

Translation is an explicit enrichment step, not an implicit side effect of summarization.

Summaries may be generated in a requested output language, but the system must track source language and any translation/transformation used.

## Translation Artifact

```text
translation_artifact
  source_item_id
  source_language_bcp47
  target_language_bcp47
  provider
  model
  model_version
  prompt_template_version nullable
  quality_confidence
  cost
  created_at
```

## When To Translate

Translate only when:

- user summary rule requires it;
- digest output language requires it;
- relevance classifier needs normalized language;
- product explicitly enables cross-language search.

Do not translate every item by default.

## Relevance Across Languages

MVP:

- detect language;
- apply keyword rules only where language matches or user config allows;
- use embeddings/model classification where needed and budgeted.

Later:

- multilingual embeddings;
- translated query expansion;
- per-language topic rules.

## UI

UI should show when content/summary is translated or generated in a different language from source.

## Locked Decisions

1. Translation is explicit and tracked.
2. Do not translate every item by default.
3. Summary output language is rule-driven.
4. Translation artifacts track provider/model/cost.
5. UI should expose translated/generated language state where relevant.

