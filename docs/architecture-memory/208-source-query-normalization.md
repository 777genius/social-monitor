# 208. Source Query Normalization

## Status

Locked for source adapter baseline.

## Research Anchors

- Reddit API documentation: https://www.reddit.com/dev/api/
- Hacker News official API: https://github.com/HackerNews/API
- CloudEvents specification: https://github.com/cloudevents/spec

## Decision

Use a provider-neutral source query model and map it to source-specific capabilities. Providers differ too much to expose their native query languages directly in the product core.

## Normalized Query Fields

Core query plan can include:

- source kind;
- terms;
- exact phrases;
- excluded terms;
- language;
- author/community/channel filters;
- time window;
- sort preference;
- min engagement thresholds;
- comment depth/hydration policy;
- media inclusion policy;
- cursor/backfill window.

## Capability Mapping

Each adapter declares:

- supported filters;
- unsupported filters;
- approximated filters;
- max lookback;
- max page size;
- sort options;
- rate/cost estimate.

If a source cannot support a filter exactly, the system either rejects the rule or marks the plan as approximated and applies post-filtering where cost allows.

## Best-Fact Choice

Provider-neutral queries keep the product portable, but the UI must show when a source cannot exactly support a user's desired rule.

