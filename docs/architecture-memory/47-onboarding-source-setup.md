# Onboarding & Source Setup

Date: 2026-05-31
Status: baseline onboarding memory

## Decision

Onboarding should validate the full product loop quickly with low-risk sources before asking users for expensive or fragile integrations.

Recommended onboarding order:

```text
1. create topic
2. attach HN or RSS source
3. run first scan
4. show feed
5. generate first summary
6. configure digest
7. connect Reddit
8. enable X only after budget/limits are explained
```

## Why

HN/RSS prove value without OAuth, provider costs or X/API volatility.

## Source Setup UX

Source setup should expose:

- source health;
- required permissions/scopes;
- expected scan frequency;
- known limitations;
- estimated cost where relevant;
- reauthorization state;
- policy/retention summary.

## First-Run Constraints

First scan should be bounded:

```text
max_items
max_runtime
max_cost
max_lookback
```

Do not allow a new user to accidentally trigger a huge backfill or expensive X/provider scan.

## Source Health States

User-visible:

```text
active
paused
needs reauthorization
rate limited
delayed
source unavailable
budget exceeded
```

## Locked Decisions

1. Onboarding starts with HN/RSS before X.
2. First-run scans are bounded.
3. Source setup explains permissions, limitations and cost.
4. X enablement requires budget/limit visibility.
5. Onboarding demonstrates feed + summary loop early.

