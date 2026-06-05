# Media, Transcripts & Attachments

Date: 2026-05-31
Status: baseline media/transcript memory

## Decision

Treat media, transcripts and attachments as referenced artifacts with policy-specific fetching, retention and processing.

Do not automatically download every media asset from social sources.

## Media References

Canonical item stores media refs:

```text
media_refs[]
  media_type
  source_url
  canonical_url nullable
  thumbnail_url nullable
  width nullable
  height nullable
  duration nullable
  mime_type nullable
  source_policy
  fetch_status
```

Media bytes are not core product truth.

## Fetching Rules

Fetch media only when:

- source policy allows it;
- product feature requires it;
- budget allows it;
- content safety checks are defined;
- retention policy exists.

Default:

```text
store metadata/ref, not bytes
```

## Transcripts

Transcripts are text artifacts linked to source item:

```text
transcript_ref
language_bcp47
source
confidence
generated_by nullable
retention_policy
```

Transcript sources:

- official source transcript;
- user-provided transcript;
- provider transcript;
- generated speech-to-text later.

Generated transcripts must track model/provider/cost.

## Attachments

Attachments are hostile until validated.

Rules:

- no arbitrary file execution;
- content type detection;
- size limit;
- antivirus/scanning later if downloads are supported;
- object storage quarantine area;
- never render raw attachment inline by default.

## Locked Decisions

1. Store media refs by default, not media bytes.
2. Media fetching is policy/cost/feature gated.
3. Transcripts are versioned artifacts with source/confidence.
4. Generated transcripts track model/provider/cost.
5. Attachments are hostile and require validation/quarantine.

