# 327. Code Quality Guardrails

## Status

Locked for MVP implementation.

## Decision

Code quality rules must be enforceable, not only documented. `npm run verify` must include a fast code-quality gate before expensive build/test steps, so structural regressions fail early.

## Enforced Rules

1. Every production feature use case under `libs/**/features/**/*.use-case.ts` must have a focused sibling `*.use-case.spec.ts`.
2. Every feature use-case spec must reference the exported `*UseCase` class and include at least one executable `it(...)` or `test(...)`.
3. Committed tests must not use `.only` or `.skip`.
4. Feature use cases return `Result` failures with `err(new DomainError(...))`; they must not throw `DomainError` directly.
5. Feature use cases depend on ports and must not instantiate concrete `InMemory*` adapters.
6. Tenant-scoped REST controllers must call `requireTenantScope(...)` before invoking application use cases.
7. Public catalog controllers must be explicitly allowlisted in `scripts/check-code-quality.mjs`.
8. Production code in `apps` and `libs` must not use `console.*`; logging must go through structured platform logging ports/adapters.
9. Committed docs must not keep temporary commit evidence markers after merge.
10. Summary or LLM-cost producing changes must keep cost attribution executable through `npm run check:summary-cost`; token/cost telemetry cannot be documented only in prose.
11. Summary source-window or feed freshness changes must keep `npm run check:summary-window` passing; completed artifact text remains immutable and freshness is exposed as read-model metadata.
12. Summary execution retry changes must keep `npm run check:summary-retry` passing; transient provider failures must not publish artifacts/events and successful retries must clear failure state.
13. Source provider changes must keep `npm run check:source-certification` passing; every `enabled_beta` provider needs deterministic fixture certification and a current `ops/ingestion/source-provider-certification.json` artifact.
14. Delivery/realtime changes must keep `npm run check:delivery-replay` passing; replay cursors must detect retained-window gaps and delivery attempts must remain idempotent with preference recheck before provider send.
15. Core-loop changes across monitoring, ingestion, feed, summary or delivery must keep `npm run check:mvp-core-loop` passing; the topic/source/scan/feed/summary/feedback/realtime path and source binding pause/resume behavior must stay executable without network access.
16. Source readiness, source catalog or beta scope changes must keep `npm run check:beta-scope-policy` passing; deferred providers must not become bindable without explicit readiness approval.
17. Ring expansion, capacity, cost or source-health policy changes must keep `npm run check:beta-ring-policy` passing.
18. Runtime persistence or worker wiring changes must keep `npm run check:persistence-readiness` passing; in-memory/noop state adapters in runtime modules require owner, risk and durable replacement plan.
19. Monitoring durable persistence changes must keep `npm run check:monitoring-persistence` passing; topic/source binding/scan policy/scan job adapters must preserve tenant scope, pause status, source catalog provider rehydration, scan policy `nextRunAt` and scan job status transitions.
20. Ingestion/feed durable persistence changes must keep `npm run check:ingestion-feed-persistence` passing; source item dedupe, cursor roundtrip, feed canonical dedupe, feed read rehydration, scan failure queue persistence, scan attempt persistence, scan lease fencing/release behavior, feed persistence mode validation, ingestion-worker persistence mode validation and ingestion-support persistence mode validation must stay executable.
21. Summary durable persistence changes must keep `npm run check:summary-persistence` passing; summary job idempotency/status transitions, artifact payload rehydration, pagination, feedback evidence roundtrip and summary persistence mode validation must stay executable.
22. Identity durable persistence changes must keep `npm run check:identity-persistence` passing; API key create/list/verify/revoke, hash-only storage exposure and identity persistence mode validation must stay executable.
23. Usage durable persistence changes must keep `npm run check:usage-persistence` passing; public API audit redaction, rate-limit bucket counting, quota bucket reservation and usage persistence mode validation must stay executable.
24. Delivery durable persistence changes must keep `npm run check:delivery-persistence` passing; attempt idempotency/state rehydration, retry counters, transition timestamps, terminal failure semantics, digest window lookup, digest provenance, due schedule lookup/update and delivery persistence mode validation must stay executable.
25. Architecture boundaries remain separately enforced by `npm run check:architecture`.

## Current Gate

Run:

```bash
npm run check:code-quality
```

The gate is part of:

```bash
npm run verify
npm run check:release
```

`npm run check:release` also verifies that every release gate command is included in `npm run verify`, so code-quality cannot remain only a release-document entry.

## Test Cadence Guardrail

During active MVP implementation, do not run broad Jest/e2e suites after every small edit. Move in meaningful vertical slices, then run the smallest evidence set that proves the changed contract:

- `npm run build` after typed contracts, DI wiring or public interface changes.
- Focused unit specs for changed use cases/adapters.
- Fast smoke checks for vertical paths when Jest/Nest e2e startup is too slow for the edit loop.
- Targeted Jest e2e only at critical REST/worker boundaries or before a commit that changes those boundaries.

`npm test` and `npm run test:e2e` must run through `scripts/run-with-timeout.mjs`, so a slow or leaked Jest handle fails explicitly instead of blocking implementation progress indefinitely.

## Why This Exists

Clean Architecture fails slowly when use cases stop being directly testable, controllers skip tenant scope, or application code starts depending on adapters. These are high-leverage quality failures, so they are checked by script instead of relying on reviewer memory.

## Reviewer Policy

- A new use case without a sibling spec is blocked.
- A formal spec that does not reference its use case is blocked.
- A focused or skipped test committed with `.only` or `.skip` is blocked.
- A REST endpoint without tenant/workspace scoping is blocked unless the endpoint is a deliberate public catalog endpoint and the allowlist is updated in the same PR.
- Sensitive workspace management endpoints must enforce authorization at the interface/application boundary through a port-backed policy, not only tenant headers.
- A direct infrastructure dependency in a feature is blocked.
- A production `console.*` call is blocked.
- A smoke script can supplement e2e, but it cannot replace a missing use-case spec.
- Summary cost or model-routing changes must refresh committed cost attribution evidence and keep the release gate blocking.
- Summary window/freshness changes must prove UTC boundary behavior and stale marking with executable smoke or focused tests.
- Summary retry changes must prove failure isolation, same-job replay and single-event success semantics with executable smoke or focused tests.
- Source provider changes must prove capability/readiness alignment, stable identity, cursor contract and classified failures through `npm run check:source-certification`.
- Beta scope/source policy changes must prove unsupported providers stay out of binding and route demand to source-owner feedback through `npm run check:beta-scope-policy`.
- Ring expansion changes must prove capacity, cost, source-health thresholds and degradation actions through `npm run check:beta-ring-policy`.
- Runtime module changes must declare any in-memory/noop state adapter through `npm run check:persistence-readiness`; external beta cannot be treated as complete until the durable replacement exit criteria are met.
- Monitoring Prisma adapter/runtime-selector changes must prove mapper/repository behavior for topics, source bindings, scan policies and scan jobs through `npm run check:monitoring-persistence`.
- Ingestion/feed Prisma adapter changes must prove source item, cursor, feed read-model, scan failure queue, scan attempt and scan lease behavior through `npm run check:ingestion-feed-persistence`.
- Summary Prisma adapter changes must prove summary job, artifact and feedback behavior through `npm run check:summary-persistence`.
- Identity Prisma adapter/runtime-selector changes must prove API key create/list/verify/revoke behavior and no secret-hash exposure through `npm run check:identity-persistence`.
- Usage Prisma adapter/runtime-selector changes must prove audit/rate-limit/quota behavior through `npm run check:usage-persistence`.
- Delivery Prisma adapter/runtime-selector changes must prove attempt idempotency, state rehydration, terminal failure behavior, digest window lookup and due schedule update through `npm run check:delivery-persistence`.
- Delivery/realtime changes must prove stale replay cursor resync, duplicate notification idempotency and preference suppression before provider send through `npm run check:delivery-replay`.
- Monitoring, ingestion, feed, summary, feedback or realtime changes must keep the deterministic backend MVP loop green through `npm run check:mvp-core-loop`; paused source bindings must not accept new scan work, reserve quota or enqueue ingestion commands.
- Evidence docs must be updated from temporary branch markers to concrete commit SHAs before merge.

## MVP Boundary

This gate does not replace full integration or e2e coverage. It protects the highest-risk structural rules cheaply. Post-MVP gates should add repository integration coverage, broker contract tests and real provider certification.
