# 358 - Browser Capture Tools / Zeeschuimer / 4CAT Options 2026

## Last Verified

2026-06-04.

## Sources

- Zeeschuimer Bellingcat toolkit entry: https://bellingcat.gitbook.io/toolkit/more/all-tools/zeeschuimer
- Zeeschuimer Sciences Po entry: https://medialab.sciencespo.fr/outils/zeeschuimer/
- 4CAT GitHub: https://github.com/digitalmethodsinitiative/4cat
- Meemoo Zeeschuimer + 4CAT guide: https://kennisbank.meemoo.be/toolbox/installatie-en-gebruik-van-zeeschuimer-en-4cat-voor-het-archiveren-van-sociale-media

## Current Reality

Zeeschuimer is a browser-extension capture approach often used with 4CAT. It can capture social media data encountered in a researcher/browser workflow and send it to 4CAT for analysis.

Supported platform lists include sources such as TikTok, Instagram, X/Twitter, LinkedIn, 9gag, Imgur, Douyin, Gab, Truth Social, Pinterest and RedNote/Xiaohongshu.

## Option A - Use as Research Reference

Pros:

- shows real-world long-tail platform capture demand
- demonstrates browser-observed JSON capture plus downstream analysis
- useful for understanding what researchers collect

Cons:

- not a server-side production ingestion model
- depends on user/browser context
- platform behavior can change

Use for:

- research inspiration
- manual source feasibility exploration

## Option B - Internal Analyst Tool

Pros:

- can support one-off investigations
- can import manually collected datasets into our normalization pipeline
- useful for customer discovery and source prototyping

Cons:

- not automated reliable scanning
- must be clearly separated from SaaS source claims
- import must carry provenance and data-right metadata

Use for:

- admin-only/manual dataset import

## Option C - Production Automated Browser Capture

Decision:

```text
rejected_not_production_safe
```

Reason:

- fragile for multi-tenant SLAs
- high platform/account risk
- hard to cost, monitor and contract
- should not be the default acquisition path

## Recommended Path

```text
allow manual research dataset import; do not build production source coverage on browser capture
```

## Architecture Rule

Any browser-captured dataset must enter through `ManualDatasetImportPort`, not through normal `SourceProviderPort`.

