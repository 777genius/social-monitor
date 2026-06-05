# 159. Source Sandbox Harness

## Status

Locked for connector testing baseline.

## Research Anchors

- Reddit API documentation: https://www.reddit.com/dev/api/
- Reddit Developer Platform guidelines: https://developers.reddit.com/docs/guidelines
- Hacker News official API: https://github.com/HackerNews/API

## Decision

Every source adapter needs a sandbox harness that can run without touching production tenants or uncontrolled external APIs.

## Harness Modes

| Mode | Purpose |
|---|---|
| fake deterministic | unit/CI tests, no network |
| fixture replay | normalization regression tests |
| sandbox external | limited real provider tests where allowed |
| shadow read | compare new adapter behavior without user impact |
| canary tenant | small production rollout with kill switch |

## Requirements

- Official API docs and policy links stored with adapter.
- Test credentials are separate from production credentials.
- Sandbox data is marked and cannot enter production feed.
- Network tests are opt-in and rate-limited.
- Fixture payloads are redacted if they contain sensitive data.
- Adapter contract suite runs for every connector.

## Source Notes

HN is suitable for early real integration tests because the official API is public read-only. Reddit requires closer policy/rate-limit handling and sandbox subreddit/local testing where applicable.

## Best-Fact Choice

Fake adapters are necessary but not enough. Use deterministic fakes for speed, fixture replay for regression, and carefully bounded real-provider tests for contract drift.

