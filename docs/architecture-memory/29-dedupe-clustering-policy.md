# Dedupe & Clustering Policy

Date: 2026-05-31
Status: baseline dedupe/clustering memory

## Decision

Dedupe is a multi-stage pipeline. Do not rely only on embeddings.

Use cheap deterministic dedupe first, then near-duplicate detection, then semantic clustering.

References:

- scikit-learn clustering guide: https://scikit-learn.org/stable/modules/clustering.html
- SimHash near-duplicate paper: https://research.google.com/pubs/archive/33026.pdf
- MinHash/LSH background: https://en.wikipedia.org/wiki/MinHash

## Pipeline

```text
canonical source id dedupe
-> canonical URL dedupe
-> normalized text hash
-> near-duplicate fingerprint
-> embedding similarity
-> semantic cluster
```

## Dedupe Keys

Store:

```text
source_type
provider
external_id
canonical_url
content_hash
normalized_hash
near_duplicate_fingerprint
embedding_id
cluster_id
```

## Exact Dedupe

Exact dedupe uses:

- source external ID;
- canonical URL;
- normalized text hash;
- title/body normalized hash.

## Near-Duplicate Dedupe

Use near-duplicate fingerprints for reposts, mirrored articles, template-heavy posts and provider duplicates.

Candidate approaches:

- SimHash for fast text similarity fingerprinting;
- MinHash/LSH for Jaccard-like near-duplicate detection.

Do not start with complex GPU/index infrastructure. Add it only if volume requires it.

## Semantic Clustering

Use embeddings after cheap dedupe.

Semantic clustering groups:

- same story across sources;
- discussion around same URL;
- reposted news with different wording;
- related social commentary around one event.

## Cluster Versioning

Clusters are not immutable truth. Store:

```text
cluster_algorithm
cluster_algorithm_version
embedding_model
embedding_model_version
cluster_created_at
cluster_updated_at
```

When clustering algorithm changes, old summaries must remain traceable to old cluster version.

## Summary Rule

Summarize clusters, not individual duplicate posts, whenever possible.

## Locked Decisions

1. Dedupe is multi-stage.
2. Embeddings are not first-line dedupe.
3. Store exact, near-duplicate and semantic identifiers separately.
4. Clustering algorithm/model versions are stored.
5. Summaries reference cluster and algorithm versions.

