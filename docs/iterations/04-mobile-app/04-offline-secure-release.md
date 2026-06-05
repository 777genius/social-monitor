# Iteration 04 / Phase 04 - Offline Secure Release

## Objective

Prepare mobile app for reliable local state, secure token handling and release flavors.

## Steps

1. Add build flavors: local, dev, staging, production.
2. Add secure storage adapter for session secret.
3. Add offline read cache for topics/feed/summaries.
4. Add cache invalidation on logout/tenant switch.
5. Add crash/analytics privacy adapter.
6. Add release checks for env mismatch.
7. Add cache namespace per tenant/workspace/user.
8. Add offline write policy: MVP read-cache only unless a use case explicitly supports queued writes.
9. Add token refresh/re-auth recovery flow for expired sessions.
10. Add privacy scrubber for crash/error payloads.

## Cache Policy

- Cache only read models needed for beta UX: topics, source bindings, feed items, summaries and status snapshots.
- Namespace cache by tenant/workspace/user.
- Clear or seal cache on logout, tenant switch and auth revocation.
- Mark cached data with freshness timestamp and source contract version.
- Do not cache provider credentials or raw provider payloads on mobile.
- Do not queue write actions unless backend idempotency and conflict handling are explicitly supported.

## Offline State Rules

1. Offline read cache can show topics, source bindings, feed, summaries and last known status.
2. Offline cached data always shows freshness timestamp.
3. Offline create/edit/bind/regenerate actions are disabled in MVP unless explicitly supported by backend idempotency and conflict resolution.
4. If auth expires while offline, app keeps cached data sealed and requires re-auth before refresh.
5. Push/WebSocket status is never treated as durable state without REST refresh.
6. Cache contract version mismatch forces cache discard or migration.

## Release Checklist

1. Flavor config matches API base URL and environment.
2. Secure storage adapter is available or app forces re-auth.
3. Crash/error scrubber removes auth tokens, source content, provider payloads, prompts and credentials.
4. Cache isolation test passes for tenant/workspace/user.
5. Golden/widget/store tests pass for small phone, normal phone and text scale.
6. Generated OpenAPI client version matches backend contract.
7. App can recover from expired token and backend Problem Details errors.

## Edge Cases

- Production app points to staging API.
- Secure storage unavailable.
- Cached data from previous tenant appears.
- Token expires while app is offline.
- Crash report includes source item content or auth token.
- Cached summary references a feed item no longer available.
- Offline state hides a server-side authorization change.
- Cache contract version changes while app is in background.
- Source binding was revoked server-side while mobile shows old cached enabled state.
- User logs out, then opens app before cache wipe completes.

## Pay Attention

- Provider credentials never live on mobile.
- Mobile does not run scans.
- Push is a hint; REST read model is truth.
- Do not store raw source body unless a specific read-model contract requires it and privacy review approves.
- Treat stale cached data as a UX state, not as fresh operational truth.

## Acceptance Criteria

- Flavor/env checks pass.
- Logout clears session/cache as policy requires.
- Offline feed shows stale marker.
- App can recover after token expiry.
- Cache isolation test proves data does not cross tenant/workspace/user boundaries.
- Crash/error reporting redacts tokens, credentials and sensitive source payloads.
- Offline write actions are disabled or explicitly backed by idempotent conflict-handled use cases.
- Release flavor mismatch fails before beta distribution.
