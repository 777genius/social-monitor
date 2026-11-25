# 368 - Gab/Truth Social Alt-Tech Options 2026

## Last Verified

2026-06-04.

## Sources

- Truth Social platform context: https://en.wikipedia.org/wiki/Truth_Social
- Truth Social third-party API/vendor example: https://scrapecreators.com/blog/the-best-truth-social-api-for-tracking-trump-s-posts
- Truth Social dataset/research context: https://arxiv.org/abs/2602.14406
- Truth Social ICWSM dataset paper: https://ojs.aaai.org/index.php/ICWSM/article/download/22211/21990/26274
- Gab platform context: https://en.wikipedia.org/wiki/Gab_%28social_network%29
- Gab company/report context: https://www.sec.gov/Archives/edgar/data/1709244/000170924426000001/gabar.pdf

## Current Reality

Gab and Truth Social are politically sensitive alt-tech platforms. They can matter for threat intelligence, misinformation research, political monitoring and OSINT, but they are high-risk sources for a general social monitoring SaaS.

Broad official developer access is limited or unclear. Most practical collection appears in research datasets, vendor APIs, or source-specific tooling.

## Option A - Official API / Platform Access

Pros:

- best production posture if available
- lower provenance risk

Cons:

- public developer access is limited/unclear
- coverage and terms must be verified directly
- source category has elevated moderation/safety risk

Use for:

- specialized enterprise/government/research contexts only

## Option B - Research Datasets

Pros:

- useful for academic evaluation, stance detection and conversation-structure modeling
- avoids live ingestion risk for initial analysis

Cons:

- historical, not live
- licensing/reuse may be limited
- safety and moderation issues remain

Use for:

- offline research only

## Option C - Vendor/Third-Party API

Pros:

- faster than direct integration
- can expose profiles/posts/comments in a normalized form

Cons:

- provenance and legality must be reviewed
- may depend on scraping
- reputational and safety risk

Use for:

- `enterprise_only` or `vendor_adapter_only` after explicit policy approval

## Option D - Direct Scraping

Decision:

```text
rejected_not_production_safe
```

## Recommended Path

```text
do not include in MVP; support only via explicit high-risk source approval workflow
```

## Architecture Rule

Alt-tech sources require `HighRiskSourcePolicy`: customer eligibility, content safety handling, analyst access controls and legal review before enablement.

