# 365 - Bilibili Acquisition Options 2026

## Last Verified

2026-06-04.

## Sources

- Bilibili open platform docs: https://open.bilibili.com/doc
- Bilibili third-party endpoint directory: https://docs.justoneapi.com/en/api/bilibili/
- Public Bilibili API tooling ecosystem: https://github.com/topics/bilibili-api
- Bilibili dataset/research context: https://arxiv.org/abs/2305.05880
- Bilibili platform behavior community context: https://www.reddit.com/r/Bilibili/comments/1qebovb/how_are_you_downloading_videos_from_bilibili/

## Current Reality

Bilibili is a major Chinese video/community platform. It has an open platform, but broad video search/social listening access is not as straightforward as YouTube Data API.

Practical monitoring may require partner access, regional vendor APIs, or limited public/research workflows.

## Option A - Official Open Platform

Pros:

- official entry point exists
- preferable for production if access and endpoints match needs
- can support owned/authorized integrations

Cons:

- public search/listening scope must be verified
- Chinese-language docs/processes and regional compliance
- may not expose all engagement/comment data needed

Use for:

- regional enterprise connector after validation

## Option B - Vendor API

Pros:

- can provide search and creator/video metadata quickly
- simpler integration path for topic discovery
- useful for China-market intelligence

Cons:

- data provenance and rights review required
- quality and freshness vary
- possible vendor lock-in

Use for:

- `vendor_adapter_only`

## Option C - Public Dataset / Research Data

Pros:

- useful for multimodal model evaluation
- good for schema design and Chinese video taxonomy

Cons:

- not live production monitoring
- licensing and update window limitations

Use for:

- offline research only

## Option D - Downloader/Scraper Tooling

Decision:

```text
research_only / rejected_not_production_safe for SaaS ingestion
```

Reason:

- often aimed at media download, not compliant monitoring
- fragile and not a source contract

## Recommended Path

```text
defer for MVP; evaluate vendor and official partner routes for China-market package
```

## Architecture Rule

Bilibili should share the same `VideoSourceProviderPort` as YouTube/PeerTube, but with stricter region/vendor governance.

