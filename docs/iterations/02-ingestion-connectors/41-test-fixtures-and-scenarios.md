# Iteration 02 - Test Fixtures And Scenarios

## Purpose
Define ingestion fixtures that certify providers and protect normalized feed behavior.

## Core Fixtures
- Fake provider with deterministic pages.
- Fake provider with duplicates, errors and reordered items.
- HN story, comment, deleted item and missing-field samples.
- RSS feed with GUID, without GUID, malformed XML and timezone ambiguity.
- Cursor before scan, after partial scan and after complete scan.
- Provider rate-limit response with retry-after and without retry-after.
- Provider partial outage response where some items are valid and some are malformed.
- Edited item where provider id is stable but title/body/date changes.
- Unavailable/deleted item after it was already ingested.
- Same public item appearing through HN and RSS.
- Same public item appearing in two tenants.
- Fake clock with interval boundary, clock skew and manual/scheduled overlap samples.
- Provider samples with missing, malformed, timezone-ambiguous and future timestamps.

## Happy Path Scenarios
- HN scan persists normalized feed items.
- RSS scan persists normalized feed items.
- Cursor advances after durable persistence.
- Scan status event is emitted.
- Repeated scans do not duplicate feed items.
- Feed pagination remains stable while a later scan adds new items.

## Negative Scenarios
- Provider returns malformed data.
- Provider times out mid-scan.
- Same item appears twice across pages.
- Cursor write fails after item persistence.
- Cursor would advance before durable item persistence.
- Provider DTO field appears in domain/feed read model.
- Source binding disabled after job queued but before worker write.
- Manual scan overlaps scheduled scan for the same binding.
- Quota preflight denies scan before provider call.
- Topic disabled after job enqueue and before lease claim.
- Source credential revoked after lease claim and before provider call.
- Scan policy changes after enqueue and before execution.
- Capability profile version changes while binding has old snapshot.
- Scheduled scan hits exact interval boundary.
- Manual scan runs seconds before scheduled scan and shares throttle/idempotency policy.
- Provider returns future timestamp after cursor was already committed.
- Provider returns reordered page where older item appears before newer item.
- Backfill window start/end boundary is hit exactly.

## Edge Cases
- External item disappears between scans.
- RSS item has no stable ID.
- Provider returns old item before new item.
- User config schedules overlapping scans.
- RSS ETag returns 304 while local previous payload is missing.
- Provider cursor expires and requires bounded backfill reset.
- Canonical URL normalization could merge unrelated pages.
- Provider changes account tier and removes search capability.
- Worker lease expires during provider call and second worker claims retry.
- Server clock moves forward between enqueue and lease claim.
- Provider clock is behind server clock by several hours.
- RSS item timezone is missing and must use source/default policy.
- DST affects user-facing schedule copy but not scan execution.

## Regression Seeds
- Connector certification fixture pack.
- Normalized feed item snapshot.
- Provider error taxonomy examples.
- Cursor crash/retry fixture pack.
- Source readiness profile examples for Reddit, X/Twitter, Telegram, GitHub and YouTube.
- Source health mapping examples for unavailable, limited, paused, quota_exhausted and provider_degraded.
- Temporal scheduler fixture pack: fake clock, interval boundary, future timestamp, reordered items and bounded backfill.
