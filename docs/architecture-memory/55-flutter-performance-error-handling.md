# Flutter Performance & Error Handling

Date: 2026-05-31
Status: baseline Flutter performance/error memory

## Decision

Frontend performance must be designed around bounded lists, view models and controlled rebuilds.

Reference:

- Flutter performance best practices: https://docs.flutter.dev/perf/best-practices

## Performance Rules

- use stable IDs for lists;
- use pagination/cursor loading;
- do not hold full backend datasets in MobX stores;
- use bounded visible caches;
- avoid expensive computed values over large lists;
- avoid unnecessary rebuilds;
- prefer const widgets where useful;
- virtualize long lists/tables;
- keep DTO mapping out of build methods.

## Feed UI

Feed must support:

```text
cursor pagination
source/topic filters
loading states
empty states
partial failure states
stale data indicator
summary availability indicator
```

## Error Handling

Presentation errors should be actionable:

```text
needs reauthorization
rate limited
budget exceeded
source unavailable
scan delayed
summary failed
network offline
```

Do not expose infrastructure errors to normal users:

```text
Kafka lag
DLQ count
OAuth invalid_grant raw response
provider stack trace
SQL error
```

## Secure Storage

Use secure storage for sensitive local tokens where needed.

Reference:

- flutter_secure_storage: https://pub.dev/packages/flutter_secure_storage

Rules:

- no source/provider credentials on device;
- short-lived access token where possible;
- refresh token only if product auth architecture requires it;
- clear secure storage on logout/account switch;
- handle secure storage migration failures gracefully.

## Locked Decisions

1. Flutter stores hold bounded presentation state.
2. Large lists use cursor pagination/virtualization.
3. Build methods do not perform DTO mapping or network calls.
4. User errors are actionable and product-level.
5. Secure storage is only for app auth tokens, not source credentials.

