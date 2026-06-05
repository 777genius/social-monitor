# 300 - Deterministic Testing Clock ID Policy

## Decision

Tests use deterministic clocks and ID generators whenever behavior depends on time, ordering, cursor windows or generated identifiers.

Random time and random IDs in tests are allowed only when randomness itself is under test.

## Sources

- RFC 9562 UUIDs: https://www.rfc-editor.org/rfc/rfc9562
- IANA Time Zone Database: https://www.iana.org/time-zones
- Martin Fowler, non-determinism in tests: https://martinfowler.com/articles/nonDeterminism.html

## Test Ports

Application code uses:

```text
ClockPort
IdGeneratorPort
RandomPort
```

Production adapters use real time/UUID generation.

Tests use deterministic adapters.

## Fixed Clock

Use fixed instants for:

- scan windows
- retention deadlines
- billing periods
- token expiry tests
- summary source windows
- digest scheduling
- audit event assertions

## Advancing Clock

Use controllable advancing clocks for:

- retry/backoff tests
- lease expiry
- rate-limit windows
- token refresh
- circuit breaker half-open timing

Do not sleep in tests unless testing real runtime behavior.

## Deterministic IDs

Use predictable generated IDs in:

- snapshots
- API contract tests
- fixture builders
- event assertions
- migration/backfill tests

This makes diffs readable and failures reproducible.

## Time Zone Fixtures

Test time-sensitive code with:

- UTC
- tenant timezone with DST
- timezone without DST
- DST spring-forward gap
- DST fall-back repeated hour

Use IANA zone ids.

## Architecture Rule

Production needs real clocks and IDs.

Tests need controlled clocks and IDs.
