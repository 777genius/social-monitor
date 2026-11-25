# 140. Source Terms Compliance Automation

## Status

Locked for source governance baseline.

## Research Anchors

- Reddit Developer Terms: https://redditinc.com/policies/developer-terms
- Reddit Data API Terms: https://redditinc.com/policies/data-api-terms
- Reddit API documentation: https://www.reddit.com/dev/api/

## Decision

Source terms and provider policies must be machine-visible in the system. Compliance cannot depend only on engineers remembering a document.

## Policy Metadata Per Source

Each source adapter includes:

- official terms URL;
- API docs URL;
- allowed use notes;
- prohibited use notes;
- caching/retention constraints;
- redistribution constraints;
- attribution/display requirements;
- rate-limit policy;
- commercial approval requirement;
- last reviewed date;
- next review date;
- owner.

## Compliance Gates

Before enabling a source in production:

- policy metadata complete;
- credential flow approved;
- retention policy compatible;
- display/attribution requirements implemented if needed;
- export/deletion behavior reviewed;
- rate limits tested;
- source-specific risks recorded.

## Runtime Controls

- feature flag per source;
- kill switch per source;
- plan/source eligibility checks;
- policy version stored on source binding;
- scan jobs include policy version used;
- admin warning when source policy review is overdue.

## Best-Fact Choice

Social source policies change. Treat source compliance as operational data with review cadence and runtime gates, not as a one-time architecture note.

