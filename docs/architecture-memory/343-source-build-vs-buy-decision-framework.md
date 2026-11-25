# 343 - Source Build Vs Buy Decision Framework

## Last Verified

2026-06-04.

## Decision

Choose build vs buy per source based on reliability, rights, cost, speed and strategic value.

Do not default to building every connector.

## Build When

Build first-party connector if:

- official API/open protocol exists
- terms are clear
- expected volume is manageable
- source is strategic/core
- adapter complexity is reasonable
- tests/fixtures can cover edge cases

Examples:

- Hacker News
- RSS/Atom
- GitHub
- Stack Exchange
- Dev.to/Forem
- Bluesky/Mastodon early connectors

## Buy/Vendor When

Use provider if:

- source requires partnership/firehose
- platform is closed/expensive
- broad historical coverage needed
- scraping risk is high
- data normalization is commodity
- enterprise customer pays for it

Examples:

- X firehose/archive
- Reddit enterprise archive
- TikTok public data
- Meta broad listening
- news/review web coverage

## Defer When

Defer if:

- no official API
- no approved vendor
- use case is weak
- cost cannot be justified
- terms prohibit commercial use
- source would distort MVP architecture

Examples:

- broad LinkedIn scraping
- broad Instagram scraping
- Quora direct connector
- TikTok broad monitoring for MVP

## Scorecard

Score 1-5:

```text
signal_value
official_access_quality
compliance_confidence
implementation_effort
operational_reliability
unit_economics
tenant_demand
strategic_control
```

Build if:

- signal high
- official access high
- effort manageable
- strategic control high

Buy if:

- signal high
- official direct access low
- provider confidence high
- tenant pays

Defer if:

- compliance confidence low
- unit economics bad
- demand unproven

## Architecture Rule

Adapters make both build and buy possible.

The product should not care which path a source uses.
