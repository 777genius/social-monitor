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
5. Feature use cases must not throw generic `Error` for expected application/provider validation paths; return typed `Result` failures.
6. Feature use cases depend on ports and must not instantiate concrete `InMemory*` adapters.
7. Tenant-scoped REST controllers must call `requireTenantScope(...)` before invoking application use cases.
8. Public catalog controllers must be explicitly allowlisted in `scripts/check-code-quality.mjs`.
9. Production code in `apps` and `libs` must not use `console.*`; logging must go through structured platform logging ports/adapters.
10. Committed docs must not keep temporary commit evidence markers after merge.
11. Summary or LLM-cost producing changes must keep cost attribution executable through `npm run check:summary-cost`; token/cost telemetry cannot be documented only in prose.
12. Summary source-window or feed freshness changes must keep `npm run check:summary-window` passing; completed artifact text remains immutable and freshness is exposed as read-model metadata.
13. Summary execution retry changes must keep `npm run check:summary-retry` passing; transient provider failures must not publish artifacts/events and successful retries must clear failure state.
14. Source provider changes must keep `npm run check:source-certification` passing; every `enabled_beta` provider needs deterministic fixture certification and a current `ops/ingestion/source-provider-certification.json` artifact.
15. Delivery/realtime changes must keep `npm run check:delivery-replay` passing; replay cursors must detect retained-window gaps and delivery attempts must remain idempotent with preference recheck before provider send.
16. Core-loop changes across monitoring, ingestion, feed, summary or delivery must keep `npm run check:mvp-core-loop` passing; the topic/source/scan/feed/summary/feedback/realtime path and source binding pause/resume behavior must stay executable without network access.
17. Source readiness, source catalog or beta scope changes must keep `npm run check:beta-scope-policy` passing; deferred providers must not become bindable without explicit readiness approval.
18. Ring expansion, capacity, cost or source-health policy changes must keep `npm run check:beta-ring-policy` passing.
19. Runtime persistence or worker wiring changes must keep `npm run check:persistence-readiness` passing; in-memory/noop state adapters in runtime modules require owner, risk and durable replacement plan.
20. Monitoring durable persistence changes must keep `npm run check:monitoring-persistence` passing; topic/source binding/scan policy/scan job adapters must preserve tenant scope, pause status, source catalog provider rehydration, scan policy `nextRunAt` and scan job status transitions.
21. Ingestion/feed durable persistence changes must keep `npm run check:ingestion-feed-persistence` passing; source item dedupe, cursor roundtrip, feed canonical dedupe, feed read rehydration, scan failure queue persistence, scan attempt persistence, scan lease fencing/release behavior, feed persistence mode validation, ingestion-worker persistence mode validation and ingestion-support persistence mode validation must stay executable.
22. Summary durable persistence changes must keep `npm run check:summary-persistence` passing; summary job idempotency/status transitions, artifact payload rehydration, pagination, feedback evidence roundtrip and summary persistence mode validation must stay executable.
23. Identity durable persistence changes must keep `npm run check:identity-persistence` passing; API key create/list/verify/revoke, hash-only storage exposure and identity persistence mode validation must stay executable.
24. Usage durable persistence changes must keep `npm run check:usage-persistence` passing; public API audit redaction, rate-limit bucket counting, quota bucket reservation and usage persistence mode validation must stay executable.
25. Delivery durable persistence changes must keep `npm run check:delivery-persistence` passing; attempt idempotency/state rehydration, retry counters, transition timestamps, terminal failure semantics, digest window lookup, digest provenance, due schedule lookup/update and delivery persistence mode validation must stay executable.
26. Architecture boundaries remain separately enforced by `npm run check:architecture`.
27. Claude/agent implementation guidance must stay explicit through root `CLAUDE.md`, `.claude/rules/quality-architecture.md` and `npm run check:agent-quality-rules`.
28. New runtime selectors must keep `npm run check:runtime-profile-guards` passing; beta runtime cannot silently choose process-local adapters.
29. Dependency changes must keep `npm audit --audit-level=moderate` and `npm run check:dependencies` green before feature growth continues.
30. Domain/features must not import public contracts, interface modules or generated clients; if application behavior needs contract knowledge, depend on a port and place the contract-backed implementation in an adapter.
31. Adapters and ports must not read `process.env`; runtime config must be passed explicitly from composition roots/provider-token resolvers.
32. Production files have a default 500-line budget. Existing explicit exceptions need a local budget and must not grow without splitting responsibilities.
33. Feature use cases, adapters and platform queue publishers must not read wall-clock time directly; use `Clock` when time affects behavior.
34. Adapters must not generate identities directly or instantiate `SystemClock`/`CryptoIdGenerator` defaults; composition roots provide `Clock`/`IdGenerator` when identity creation affects persisted data or cross-process messages.
35. Worker loops must create command/correlation ids through platform command-id helpers instead of ad hoc `Date.now()` strings.
36. Claude hook behavior must stay executable through `npm run check:claude-hooks`; real-project `Agent`/`TaskCreated` flows stay blocked and Stop hooks must respect `stop_hook_active`.
37. Architecture boundary checks must inspect static imports, re-exports, `require(...)` and dynamic `import(...)`; inner layers cannot bypass dependency rules with alternate import syntax.
38. Claude hook commands must use `command` + `args` with `${CLAUDE_PROJECT_DIR}`, and Stop hooks must chdir to the project root before running npm gates.
39. Claude permissions and PreToolUse hooks must block `.env`, `.envrc`, `.npmrc`, `.netrc`, cloud/kube/GitHub config, secret directories, private keys, Bash subprocess secret reads, credential CLIs, network CLIs and destructive reset commands.
40. Production runtime imports in `apps` and `libs` must not form circular dependencies; split ports/shared primitives/mappers before feature growth continues.
41. Apps must import `libs` through `@social-monitor/...` aliases, not deep-relative `../../../libs/...` paths.
42. Architecture checks must resolve relative imports before enforcing context/adapter rules, so path syntax cannot bypass the dependency rule.
43. Interface controllers, gateways, support services and authorizers must receive env-derived config through provider tokens; direct `process.env` reads are blocked outside composition files.
44. Trusted workspace-role header parsing must use `WorkspaceRoleHeaderParser`; controller-level env checks are blocked.
45. Production code must not call `randomUUID()` directly outside `CryptoIdGenerator`; transport correlation ids use `RequestCorrelationIdFactory`.
46. App controllers must not read env, wall-clock time or process uptime directly; expose readiness through provider-backed reporters.
47. REST pagination limits must use platform `parsePaginationLimit` helpers; ad hoc `Number(limitQuery)` parsing and local `parseLimit` helpers are blocked.
48. REST controllers must use `async`/`await` for transport flow; promise chains in controllers are blocked.
49. App services/controllers/reporters must not import bounded-context adapters directly; adapter-backed readiness data is injected by module provider tokens, and composition roots may import adapters.
50. Platform root barrels expose core ports/primitives only. They must not re-export `./adapters/*`, RabbitMQ, InMemory, Prisma or SDK implementation files; composition roots import platform queue/event adapters through explicit adapter subpaths and never legacy adapter shortcuts.
51. Secret and token redaction policy must live in shared-kernel redaction helpers; duplicated sensitive-key/string regexes in filters, loggers, audits or adapters are blocked.
52. Prisma persistence writes must use `withPrismaWriteRetry` from `@social-monitor/platform-persistence`; write transactions must use Serializable isolation so P2034 conflicts are retried consistently.
53. RabbitMQ production queue declarations must use the platform queue-arguments helper; ad hoc DLX/quorum argument maps in publishers or worker readers are blocked.

## Current Gate

Run:

```bash
npm run check:code-quality
npm run check:agent-quality-rules
npm run check:claude-hooks
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
- Agent quality rules disappearing, becoming too large or losing mandatory Clean Architecture/SOLID/DRY/runtime/source-readiness guidance is blocked.
- Claude hooks losing `Agent`, `TaskCreated` or `stop_hook_active` coverage is blocked.
- Claude hooks using cwd-relative script paths instead of `${CLAUDE_PROJECT_DIR}` are blocked.
- Claude settings losing secret deny rules or Bash secret/network/destructive command hook coverage is blocked.
- Claude policy hooks must fail closed on malformed hook JSON; an ordinary hook crash is not an enforcement decision.
- Direct public-contract imports from feature/domain code are blocked.
- Hidden `process.env` reads inside adapters, ports, feature use cases or domain code are blocked.
- `require(...)` or dynamic `import(...)` cannot be used to bypass Clean Architecture import rules.
- App-to-lib deep-relative imports are blocked; use `@social-monitor/...` aliases from composition roots.
- Relative cross-context imports inside `libs` are blocked before they can hide adapter/context coupling.
- Runtime circular dependencies in production `apps`/`libs` imports are blocked.
- Interface controllers, gateways, support services and authorizers reading `process.env` directly are blocked; move env-derived config into provider tokens.
- App controllers reading `process.env`, `new Date()` or `process.uptime()` directly are blocked; move readiness assembly into provider-backed reporters.
- Prisma persistence writes without the shared retry helper or write transactions without Serializable isolation are blocked.
- App services/controllers/reporters importing bounded-context adapters are blocked; composition roots may import adapters and pass adapter-backed readiness data through provider tokens.
- Platform root barrels re-exporting adapter paths, adapter-named implementation files or legacy platform adapter shortcut imports are blocked; root aliases expose stable ports/core services, not infrastructure shortcuts.
- Duplicated secret/token redaction regexes are blocked; use shared-kernel redaction helpers so problem details, logs, audits and config protection stay aligned.
- Trusted workspace-role header parsing must go through `WorkspaceRoleHeaderParser`, not repeated `process.env` checks in controllers.
- Direct `randomUUID()` calls outside `CryptoIdGenerator` are blocked; REST/write transport code uses `RequestCorrelationIdFactory`.
- Outbound URL SSRF policy must live in shared-kernel helpers; duplicated `blockedHosts`/`isPrivateIp` style validators are blocked.
- HTTP adapters with outbound `fetch` must use `AbortSignal.timeout` so live provider calls cannot hang worker loops indefinitely.
- Ad hoc REST pagination parsing is blocked; controllers use `parsePaginationLimit` so invalid public query parameters fail consistently at the transport boundary.
- Promise chains in REST controllers are blocked; use `async`/`await` so auth, use-case invocation and result mapping stay linear.
- Hidden wall-clock or identity generation inside adapters, feature use cases, platform queue publishers or worker loops is blocked, including adapter defaults that instantiate `SystemClock`/`CryptoIdGenerator`.
- Production files exceeding line budget are blocked unless explicitly budgeted while being split down.
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
