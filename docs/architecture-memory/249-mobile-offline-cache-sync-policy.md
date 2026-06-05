# 249 - Mobile Offline Cache Sync Policy

## Decision

Flutter supports offline read cache for recent feed, summaries and settings needed for a usable experience.

Offline writes are limited and explicit. The backend remains canonical.

## Sources

- Flutter offline-first guidance: https://docs.flutter.dev/app-architecture/design-patterns/offline-first
- Android data storage overview: https://developer.android.com/training/data-storage
- Apple data persistence overview: https://developer.apple.com/documentation/foundation
- OWASP MASVS storage controls: https://mas.owasp.org/MASVS/controls/MASVS-STORAGE/

## Offline Read Cache

Cache:

- topic list
- source binding status
- recent normalized feed pages
- summary list/details
- notification preferences
- last sync timestamps

Do not cache by default:

- provider credentials
- raw payloads
- audit logs
- support/admin views
- exports
- sensitive tenant data beyond recent UI need

## Cache Ownership

Use a local repository adapter behind ports:

```text
FeedLocalCachePort
SummaryLocalCachePort
PreferencesLocalCachePort
```

Presentation stores do not know persistence implementation.

## Offline Writes

Allowed:

- notification preference changes
- UI preferences
- draft topic edits before submission

Use caution or disallow offline:

- source credential changes
- deleting topics/sources
- API key operations
- billing/admin changes
- exports

## Sync Queue

Pending mutations have:

- operation id
- tenant id
- user id
- command type
- payload version
- created at
- retry count
- last error

Every queued mutation must be idempotent server-side.

## Conflict Rules

V1 conflict policy:

- server wins for source health, scans, summaries, memberships and billing
- client may retry simple preference updates
- destructive/admin actions require online confirmation

If conflict is user-relevant, show a clear stale-state UI.

## Cache Security

Tenant cache is namespaced by:

- user id
- tenant id
- app environment

On logout, tenant switch or admin revocation, cache access is invalidated. Tenant policy may require cache deletion.

## Freshness

Every cached view exposes:

- fetched at
- stale marker
- refresh in progress
- refresh failed state

Do not silently show stale summaries as fresh.

## Architecture Rule

Offline mode improves UX. It does not move product truth to the device.
