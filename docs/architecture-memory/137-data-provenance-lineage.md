# 137. Data Provenance and Lineage

## Status

Locked for data governance baseline.

## Research Anchors

- W3C PROV overview: https://www.w3.org/TR/prov-overview/
- W3C PROV-N: https://www.w3.org/TR/prov-n/
- C2PA specifications: https://spec.c2pa.org/specifications/

## Decision

Track product-level provenance from source acquisition through derived summaries, digests and notifications. Use W3C PROV concepts as the conceptual model, but keep implementation pragmatic in relational/event metadata.

## Provenance Concepts

Map:

- source post/comment/media -> entity;
- scan run -> activity;
- source adapter/provider -> agent/system;
- normalized item -> derived entity;
- cluster -> derived entity;
- summary artifact -> derived entity;
- digest -> derived entity;
- notification delivery -> activity.

## Required Lineage Links

Every derived artifact stores:

- input entity ids;
- input artifact versions;
- source kinds;
- scan run ids;
- topic rule version;
- model/prompt/schema version where AI was used;
- transformation timestamp;
- responsible service/version.

## User-Facing Provenance

User-visible summaries should expose enough source context to inspect where a claim came from:

- source links where permitted;
- included item count;
- source/time window;
- generated-at timestamp;
- summary policy/version where useful.

Do not expose internal raw payload refs or hidden provider metadata.

## Media Provenance

C2PA is relevant for future media authenticity verification, but not a required MVP dependency. Store C2PA verification results as media metadata when sources provide or when media analysis is added.

## Best-Fact Choice

Lineage is essential for debugging, user trust, deletion workflows and AI evals. Add it now in artifact metadata, not after summaries become hard to explain.

