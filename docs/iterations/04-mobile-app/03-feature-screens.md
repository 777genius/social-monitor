# Iteration 04 / Phase 03 - Feature Screens

## Objective

Build MVP screens and flows.

## Steps

1. Topic list/create/edit screen.
2. Source binding list/create screen for HN/RSS.
3. Scan policy edit screen.
4. Feed list/detail screen.
5. Summary list/detail screen.
6. Settings: notification, scan interval, summary rules.
7. Empty/loading/error states for every screen.
8. Add typed recovery actions: retry, edit policy, reconnect source, reduce interval, view limitation, contact support.
9. Add stale/realtime status indicators for scan, feed and summary data.
10. Add citation inspection path from summary claim to source item detail.

## Store State Contract

Every screen store must expose:

- `idle/loading/refreshing/success/empty/error/stale/offline` state where relevant.
- Domain-safe data models, never raw DTOs.
- Last successful refresh timestamp where stale data can appear.
- Typed failure with user recovery action.
- Tenant/workspace guard so stale data from another workspace is not rendered.
- Idempotent action methods for retry/regenerate/refresh.

Store rules:

1. Store state is a typed state object or sealed state family, not a loose set of booleans.
2. Stores never decide source support, quota policy, summary validity or citation correctness; use cases/domain results decide.
3. Stores may combine read-model results for presentation, but must not mutate domain entities.
4. Stores keep correlation id/support code for failures where backend provides it.
5. Stores ignore late responses/events whose workspace/topic/source id no longer matches active context.
6. Store tests cover loading, success, empty, typed error, stale, offline and late-response cancellation for core screens.

## Core Screen Contracts

| Screen | Must Show | Primary Actions | Important Failure States |
| --- | --- | --- | --- |
| Dashboard | topics, source health, recent scans, latest summary state | create topic, open topic, refresh | offline, stale, no workspace, auth expired |
| Topic List | topic status, source count, latest scan/summary | create, filter, open | empty, load failed, workspace switched |
| Topic Detail | rules, bindings, scan policy, feed preview, summaries | edit, bind source, request scan, open feed | source unavailable, quota blocked, scan running |
| Source Binding | catalog, capability, limitations, credential state | bind, enable/disable, edit scan policy | unsupported source, capability limited, auth required |
| Feed List | deduped items, source labels, freshness, filters | refresh, open item, filter | empty after scan, source degraded, stale cache |
| Feed Detail | title/body fields, provenance, source observations | open citation context, back to summary | item unavailable, raw body not retained |
| Summary List | latest artifacts, status, stale/review flags | open, regenerate | no signal, failed, review required |
| Summary Detail | structured sections, citations, quality flags, lineage-safe metadata | open citation, feedback, regenerate | missing citation target, superseded, stale |
| Settings | digest, notification, summary preferences | save, test delivery | validation error, offline save unsupported |

## Recovery Action Mapping

Use backend `recoveryAction` and mobile fallback mapping:

| Failure Class | UI Action |
| --- | --- |
| validation | edit form field |
| quota_exceeded | reduce interval or wait |
| source_unavailable | view limitation or disable binding |
| source_auth_required | reconnect source |
| scan_running | view status, no duplicate request |
| summary_failed | retry/regenerate when budget allows |
| citation_unavailable | show retained provenance and stale marker |
| network_offline | show cached data and retry |
| auth_expired | re-authenticate |
| unknown | contact support with correlation id |

## Edge Cases

- No sources connected.
- Source unhealthy.
- Feed item deleted/hidden.
- Summary failed or review required.
- Network offline.
- Summary citation target is unavailable or belongs to stale feed version.
- User triggers retry twice.
- Realtime event updates a screen while manual refresh is running.
- Source catalog marks future source as readiness-only.
- Summary detail opens for a superseded artifact.
- Feed list receives duplicate-looking item from another source.
- User changes workspace from a deep summary citation route.
- Store has both `loading=true` and `error!=null` due to loose flags.
- Unknown backend enum appears in generated client and must render safe fallback.
- User taps regenerate twice while previous request is pending.
- Offline cache is newer than local store but older than server read model.

## Pay Attention

- Do not create marketing landing page; first screen is app workflow.
- Error states must map from Problem Details codes.
- Avoid card-within-card UI.
- Dense operational screens should prioritize scannable status, not large decorative sections.
- Long source limitations and citations must be readable without breaking layout.
- Navigation must preserve workspace/topic context explicitly.
- Keep feature screens operational and dense enough for repeated use; avoid decorative layouts that hide status.
- Do not show future sources as usable actions unless capability profile says they are enabled.

## Acceptance Criteria

- User can complete MVP workflow from app.
- Every screen handles loading/error/empty.
- Store tests cover main transitions.
- API failures show typed recovery actions.
- Summary screen can navigate from citation to source item/provenance.
- Screens show stale/offline states without mixing tenant data.
- Every core screen has a documented store state transition test.
- Readiness-only future sources render as unavailable/limited, not broken actions.
- Store state is modeled without contradictory boolean combinations.
- Double-tap/retry/idempotency behavior is covered for scan, refresh, regenerate and feedback actions.
