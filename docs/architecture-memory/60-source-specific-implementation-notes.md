# Source-Specific Implementation Notes

Date: 2026-05-31
Status: baseline source implementation memory

## Decision

Source-specific behavior lives in connector adapters, but early source notes should be recorded so implementation stays aligned with known constraints.

## Hacker News

Use first for pipeline validation.

Properties:

- official public Firebase API;
- stable item IDs;
- simple polling;
- cheap;
- good for testing normalization, comments, summaries and feed UX.

Reference:

- HN API: https://github.com/HackerNews/API

Implementation notes:

- item ID is external ID;
- fetch item details by ID;
- bound comment hydration depth/size;
- avoid refetching unchanged old items aggressively.

## RSS/RSSHub

Use early as general feed source.

References:

- RSSHub docs: https://docs.rsshub.app/
- RSS 2.0: https://www.rssboard.org/rss-specification

Implementation notes:

- use ETag/Last-Modified;
- respect RSS ttl/skipHours/skipDays;
- canonical URL matters;
- GUID is not always stable globally;
- raw payload retention should be short;
- per-feed policy may vary.

## Reddit

Use official API/OAuth-first.

Reference:

- Reddit Data API Wiki: https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki

Implementation notes:

- persist rate-limit headers/state;
- use cursors where available;
- model deletion/content compliance;
- source account reauth state is user-visible;
- avoid broad expensive backfills by default.

## X/Twitter

Treat as highest-risk/cost source.

Reference:

- X API docs: https://docs.x.com/x-api

Implementation notes:

- no realtime promise until access/cost proven;
- provider abstraction required;
- budget guard required;
- cost ledger required;
- failover requires policy approval;
- do not hardcode provider-specific DTOs into core.

## Telegram

Treat as permissioned source.

Reference:

- Telegram Bot API: https://core.telegram.org/bots/api/

Implementation notes:

- webhook in production where possible;
- polling acceptable for local/dev;
- persist update_id;
- bot permissions determine visibility;
- no bot tokens in frontend/logs.

## Locked Decisions

1. HN/RSS validate pipeline first.
2. Reddit is OAuth/API-first with quota/deletion handling.
3. X is cost-risk source behind provider abstraction.
4. Telegram is permissioned, not public web scraping.
5. Source constraints stay in adapters and source policy matrix.

