# Connector Certification Suite

Date: 2026-05-31
Status: baseline connector certification memory

## Decision

Every connector must pass a certification suite before production use.

"Easy to add sources" means sources pass the same behavioral contract, not just implement an interface.

## Certification Areas

Configuration:

- validates required config;
- rejects invalid config with structured errors;
- supports dry-run validation.

Authentication:

- handles missing credentials;
- handles expired credentials;
- handles revoked credentials;
- emits auth degradation events.

Rate Limits:

- reads provider/source rate limit hints;
- backs off correctly;
- persists rate-limit state;
- does not busy-loop on 429/limit errors.

Cursors:

- persists cursor;
- resumes from cursor;
- handles empty pages;
- handles deleted/missing items;
- avoids skipping/duplicating items across retries.

Idempotency:

- stable source item keys;
- retry-safe raw payload writes;
- duplicate provider result handling;
- replay-safe output.

Mapping:

- maps canonical fields;
- keeps provider-specific fields out of core;
- stores raw payload refs;
- reports field completeness.

Failure:

- retryable vs permanent error classification;
- partial success handling;
- malformed payload handling;
- provider outage handling;
- quarantine trigger.

Cost/Health:

- reports API calls/items/cost units;
- reports latency/error rate;
- reports empty-result anomaly;
- emits provider health snapshot.

Compliance:

- deleted/edited content handling where source supports it;
- retention metadata;
- source policy matrix link.

## Required Test Modes

```text
unit mapper tests
fake provider tests
sandbox/live smoke tests when available
replay tests
dry-run tests
load/concurrency tests for high-volume connectors
```

## Certification Status

```text
draft
certified_internal
beta
general_available
deprecated
disabled
removed
```

## Locked Decisions

1. No connector reaches GA without certification.
2. Certification tests are part of CI/release gates.
3. Connector quality is measured, not assumed.
4. Source policy matrix is part of connector certification.
5. Connector SDK must provide certification harness utilities.

