# 364 - Douyin/Kuaishou Short-Video Options 2026

## Last Verified

2026-06-04.

## Sources

- Douyin Open Platform video search docs: https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/douyin-search-capability/aweme-dy-video-search
- Douyin open platform API context: https://open.douyin.com/platform/resource/docs/openapi/video-management/douyin/search-video/video-data/
- TikHub Douyin/TikTok API provider: https://tikhub.io/
- LargitData social media API: https://www.largitdata.com/en/social-media-api/
- Kuaishou Q1 2026 results/platform context: https://ir.kuaishou.com/news-releases/news-release-details/kuaishou-technology-announces-first-quarter-2026-unaudited
- Kuaishou AI Open Platform: https://ai.kuaishou.com/en

## Current Reality

Douyin and Kuaishou are massive short-video platforms. They matter for China-market trend discovery, ecommerce, creator monitoring and cultural signals.

They should not be treated as TikTok clones from an access perspective. Official/partner, regional vendor and compliance constraints dominate.

## Douyin Option A - Official Open Platform APIs

Pros:

- official OAuth/API surface exists
- video search capability is documented
- better production posture than unofficial crawling

Cons:

- access scope and eligibility must be verified
- regional compliance and Chinese-language docs/processes
- not necessarily broad unrestricted social listening

Use for:

- enterprise/regional connector after access review

## Douyin/Kuaishou Option B - Regional Data Vendor

Pros:

- can provide search/video/user/ecommerce endpoints quickly
- useful for trend and ecommerce intelligence
- avoids owning brittle direct platform operations

Cons:

- vendor provenance and rights must be reviewed
- provider may depend on non-official collection methods
- cost can be significant

Use for:

- `vendor_adapter_only`

## Kuaishou Option C - Official/Partner Ecosystem

Pros:

- strong platform/ecommerce/AI ecosystem
- may support partner integrations

Cons:

- public social listening APIs are not clearly open
- partner negotiation likely required

Use for:

- later enterprise China-market roadmap

## Option D - Browser/App Automation

Decision:

```text
rejected_not_production_safe
```

Reason:

- short-video platforms are high-friction and policy-sensitive
- account verification, regional restrictions and anti-abuse controls make this unsuitable for SaaS

## Recommended Path

```text
Douyin official/partner if eligible; otherwise regional vendor adapter. Kuaishou vendor/partner only.
```

## Architecture Rule

Short-video regional sources must implement `VideoSourceProviderPort` and declare whether they support `search`, `creator_watchlist`, `comments`, `live_stream`, `ecommerce_product_context`, `transcript` and `backfill`.

