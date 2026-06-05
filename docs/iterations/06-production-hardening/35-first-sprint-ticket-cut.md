# Iteration 06 - First Sprint Ticket Cut

## Sprint Objective
Make the MVP beta-safe through tenant isolation tests, secrets handling, observability, CI gates, quotas and recovery checks.

## Ticket 1 - Tenant Isolation Test Suite
- Add cross-tenant negative tests for APIs, queries, events and realtime channels.
- Acceptance: beta cannot launch with known isolation failures.
- Edge cases: background workers and read models must be covered, not just REST.

## Ticket 2 - Secrets And Redaction
- Implement credential encryption, secret storage rules and log redaction.
- Acceptance: provider credentials never appear in logs, traces or error payloads.
- Edge cases: failed provider calls must not leak request headers or tokens.

## Ticket 3 - Metrics And Dashboards
- Add metrics for scans, adapter failures, summaries, costs, queue lag and user-visible failures.
- Acceptance: support can diagnose common failures without shell access.
- Edge cases: metrics must include tenant-safe dimensions only.

## Ticket 4 - CI Contract Gates
- Block breaking OpenAPI, event schema and migration changes.
- Acceptance: incompatible changes fail CI unless explicitly approved.
- Edge cases: additive changes must be distinguished from breaking changes.

## Ticket 5 - Quotas And Cost Controls
- Add scan and summary quotas with clear user-facing states.
- Acceptance: cost spikes are bounded by configuration.
- Edge cases: quota exhaustion during scheduled scan or summary generation.

## No-Go Criteria
- Tenant isolation is untested.
- Secrets can appear in logs.
- CI does not protect contracts/migrations/events.
