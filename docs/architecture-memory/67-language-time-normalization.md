# Language, Locale & Time Normalization

Date: 2026-05-31
Status: baseline language/time memory

## Decision

Use BCP 47 language tags and RFC 3339 timestamps for cross-source normalized data.

References:

- RFC 5646 / BCP 47 Language Tags: https://www.rfc-editor.org/info/rfc5646/
- RFC 3339 Timestamps: https://www.rfc-editor.org/rfc/rfc3339

## Language Fields

Store:

```text
detected_language_bcp47
source_language_bcp47 nullable
user_requested_output_language_bcp47
language_detection_confidence
```

Do not store language as free-form localized labels.

Examples:

```text
en
en-US
ru
uk
pt-BR
zh-Hans
zh-Hant
```

## Timestamps

Use UTC RFC 3339 timestamps at API/event boundaries.

Store:

```text
published_at
discovered_at
edited_at
deleted_at_source
created_at
updated_at
occurred_at
```

User timezone is presentation/config, not source truth.

## Source Time Issues

Some sources may provide:

- missing published time;
- local time without timezone;
- relative time labels;
- edited time but no original time;
- inconsistent provider timestamps.

Normalize with explicit confidence/source metadata:

```text
timestamp_source
timestamp_confidence
timestamp_normalization_notes nullable
```

## Summary Language

Summary output language is controlled by summary rule:

```text
output_language_bcp47
```

Do not infer output language solely from source content if user explicitly configured it.

## Locked Decisions

1. BCP 47 is language tag standard.
2. RFC 3339 UTC timestamps are API/event boundary standard.
3. User timezone is presentation/config.
4. Timestamp confidence/source metadata is stored when source data is weak.
5. Summary output language is rule-driven.

