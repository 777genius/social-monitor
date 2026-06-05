# Flutter Release, Offline & Local Cache

Date: 2026-05-31
Status: baseline Flutter mobile runtime memory

## Decision

Flutter app is a client, not a source acquisition runtime.

It may cache bounded read models for UX, but backend remains durable truth.

## Offline Scope

Allowed offline/cache:

```text
recent feed read model
recent summaries
saved digests
UI preferences
last selected topic/source filters
pending non-destructive UI drafts
```

Not allowed offline:

```text
connector credentials
provider API keys
source tokens
destructive commands
large backfills
source acquisition
budget decisions
```

## Cache Rules

- Cache is bounded by size and age.
- Cache is tenant/user scoped.
- Cache invalidates on logout.
- Cache stores application models/view models, not raw DTOs.
- Sensitive content cache can be disabled by tenant/security policy.

## Release Channels

Use staged rollout for production mobile releases.

High-risk mobile changes:

- auth/session handling;
- generated API client changes;
- offline cache migrations;
- source account connect/reauth flows;
- notification preferences;
- destructive action UI.

## Locked Decisions

1. Flutter app never performs source acquisition.
2. Offline mode is read-mostly and bounded.
3. Backend remains durable truth.
4. Cache is tenant/user scoped and cleared on logout.
5. Mobile releases touching auth/API/cache are high-risk.

