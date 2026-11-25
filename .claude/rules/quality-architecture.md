# Quality Architecture Rules

These rules exist because code quality must not depend on the memory or taste of the current agent. If a rule can be checked deterministically, prefer a script or test over a prose-only instruction.

## Clean Architecture

- Dependencies point inward: `interfaces -> application/use cases -> domain`, while `infrastructure -> application/domain contracts`. Existing `ports/` and `adapters/` folders are legacy role names, not a template for new folder shapes.
- New feature and bounded-context folders should use DDD names from `.claude/rules/ddd-clean-architecture-folders.md`.
- Domain owns business invariants. Domain must not know NestJS, Prisma, RabbitMQ, OpenAPI DTOs, source SDK payloads, environment variables or generated clients.
- Feature use cases depend on domain/application contracts and orchestrate behavior through domain objects. They must not instantiate concrete repositories, queues, HTTP clients, clocks, id generators or in-memory implementations.
- Feature use cases return typed `Result` failures for application/provider validation paths. Do not use generic exceptions for expected use-case outcomes.
- Controllers, queue handlers and gateways are translation layers only. They parse transport input, enforce tenant/auth scope, call use cases and map results to transport output.
- Infrastructure implementations translate external details into inner contracts. They may use Prisma, RabbitMQ, SDKs, HTTP clients and crypto, but their types must not leak inward.
- Apps and Nest modules are composition roots. Business decisions do not belong in provider factories except adapter selection and wiring.
- App services, controllers and reporters must not import bounded-context adapters. adapter-backed readiness data belongs behind provider tokens; composition roots may import adapters.
- Apps must import `libs` through `@social-monitor/...` aliases, not deep-relative `../../../libs/...` paths.
- Domain and feature layers must not import `@social-monitor/contracts`, interface modules or generated clients. Public contracts are outer-ring details.
- Inner contracts are Clean Architecture ports by role. They must not import frameworks, infrastructure implementations, public contracts or read `process.env`.
- Infrastructure implementations must receive runtime configuration explicitly from composition roots. Do not read `process.env` from infrastructure implementations, inner contracts, domain or feature code.
- Interface controllers, gateways, support services and authorizers must receive env-derived config through provider tokens. Do not hide `process.env` reads in transport code.
- App controllers are transport layers too: readiness/env/time/uptime data comes from providers, not direct globals.
- Trusted workspace-role header parsing belongs in the shared `WorkspaceRoleHeaderParser`, not repeated controller-level env checks.
- Request/correlation ids in transport code must go through `RequestCorrelationIdFactory`; direct `crypto.randomUUID()` belongs only behind `IdGenerator`.
- REST pagination query parsing must use platform `parsePaginationLimit` helpers. Do not reintroduce local `parseLimit` functions or `Number(limitQuery)` in controllers.
- REST controllers use `async`/`await` for transport flow. Promise chains hide error paths and make controller behavior harder to scan.
- Architecture checks must inspect static imports, re-exports, `require(...)` and dynamic `import(...)`.
- Architecture checks must resolve relative imports before judging boundaries, so deep-relative paths cannot bypass context or adapter rules.
- Platform root barrels expose core ports/primitives only. Do not re-export `./adapters/*`, RabbitMQ, InMemory, Prisma or SDK implementation files; composition roots import platform queue/event adapters through explicit adapter subpaths and never legacy adapter shortcuts.
- Production runtime imports must not form runtime circular dependencies. Split inner contracts, domain primitives or mappers instead of importing back across a layer.
- Infrastructure implementations and feature use cases must receive `Clock`/ID helpers explicitly when behavior depends on current time or generated identity. Do not hide wall-clock reads behind `Date.now()`, zero-argument `new Date()` or defaults that instantiate `SystemClock`/`CryptoIdGenerator`.
- Platform queue publishers follow adapter rules: broker timestamps and message metadata use injected `Clock`/ID helpers, not hidden process time.
- Worker loops must use platform command-id helpers, not ad hoc timestamp strings, so queue commands remain traceable and testable.
- Secret and token redaction policy lives in shared-kernel redaction helpers. Do not duplicate sensitive-key/string regexes in filters, loggers, audits or adapters.
- User-controlled outbound URLs use shared-kernel outbound URL policy. Webhook/RSS URLs must block localhost, private, carrier-grade NAT, link-local, multicast and metadata-service targets to reduce SSRF risk.
- HTTP adapters must use bounded outbound requests with `AbortSignal.timeout`; live provider calls cannot wait forever on a remote service.
- Prisma persistence writes must use `withPrismaWriteRetry` from `@social-monitor/platform-persistence`; write transactions must use Serializable isolation so P2034 conflicts are retried consistently.
- Production files that approach the line budget need splitting by responsibility before more behavior is added.
- Human-written source and test files have a hard 1000 LOC cap. Generated/build/vendor outputs are excluded. Existing legacy debt listed in `scripts/check-source-line-cap.mjs` may only shrink; adding new behavior to those files requires splitting first.

## SOLID

- SRP: split classes when changes would come from different actors, such as product policy, persistence, delivery, auth, source API or presentation.
- OCP: add providers, delivery channels, source implementations and model implementations by implementing contracts/registries, not by editing long conditional chains in use cases.
- LSP: fake/in-memory/test implementations must honor the same contract as durable implementations. They cannot silently skip tenant scope, idempotency, status transitions or cursor semantics.
- ISP: keep inner contracts capability-specific. Do not create god interfaces that force no-op methods.
- DIP: high-level policy depends on abstractions owned by the application/domain layer. Low-level adapters implement those abstractions.

## DRY Without Coupling

- Remove duplication only when the duplicated code has the same reason to change.
- Do not create shared helpers that mix bounded contexts or leak infrastructure into domain/features.
- Prefer repeated small mappers over a shared generic mapper that hides tenant scope, error semantics or domain invariants.
- If the same runtime-mode validation appears in multiple resolver functions, extract it to platform config and cover it with a contract check.

## Runtime And Beta Safety

- `SOCIAL_MONITOR_RUNTIME_PROFILE=beta` must fail fast on process-local modes such as `in-memory`, `noop`, `direct` or disabled critical loops.
- Durable beta paths use Prisma for persistence, RabbitMQ for command queues, HTTP webhook provider for real webhook delivery and enabled event relay.
- Local-dev and deterministic-test may use in-memory/fake implementations, but tests must prove they follow the same contract semantics as durable implementations.
- Any new runtime selector must be covered by `npm run check:runtime-profile-guards` or an equivalent script wired into `npm run verify`.
- Claude Code hooks are enforcement, not documentation. Keep `.claude/settings.json`, `scripts/claude-hook-guard.mjs`, `scripts/claude-hook-stop-quality.mjs` and `npm run check:claude-hooks` aligned with these rules.
- Hook commands must use `command` + `args` with `${CLAUDE_PROJECT_DIR}` so enforcement still runs after cwd changes and paths are not shell-parsed.
- Real-project agent/task flows must be blocked through both `PreToolUse` `Agent` coverage and `TaskCreated` coverage. Stop hooks must respect `stop_hook_active`.
- Claude permissions must deny `.env`, `.envrc`, `.npmrc`, `.netrc`, cloud/kube/GitHub config, secret directories and private keys. PreToolUse hooks must also block Bash subprocess access to secrets, credential CLIs, network CLIs and destructive reset commands.
- Claude hooks that enforce policy must fail closed on malformed hook JSON. For blocking events, use exit code 2 rather than ordinary process failure.

## Contracts And Generated Code

- Public REST changes must update OpenAPI snapshots and generated mobile/client contracts.
- Generated files are build artifacts from contracts. Do not manually patch generated clients to make tests pass.
- Unknown enum/error values must have an explicit client behavior.
- Breaking contract changes need migration notes or a deliberate compatibility decision.
- If a use case needs catalog/contract knowledge, introduce an application contract and put the contract-backed implementation in infrastructure.

## Data, Tenant Scope And Security

- Every tenant-owned read/write path requires tenant and workspace scope in API/application code.
- Database schema/migration changes for tenant-owned tables must keep tenant guard checks green.
- API keys, role headers and trusted headers must be dev-only unless backed by a real auth boundary.
- Secret material, token hashes, encrypted config ciphertext and raw provider credentials must not be exposed through read models.
- Tenant-provided callback/feed URLs are security-sensitive egress inputs, not plain strings. Validate them before persistence and revalidate redirect destinations before fetching.

## Source Providers

- `enabled_beta` does not mean live external beta unless `runtimeReadiness` is `live_beta_ready`.
- Fixture certification proves deterministic adapter behavior only. Live beta needs explicit rate-limit, auth, quota, terms and rollback evidence.
- Deferred sources cannot become bindable without source readiness approval and beta scope policy evidence.

## Testing And Evidence

- New use cases need focused sibling specs.
- Source and test files must stay under the 1000 LOC hard cap enforced by `npm run check:source-line-cap`.
- Adapter/runtime/contract changes need the targeted executable check that proves the changed contract.
- Smoke checks may supplement missing integration speed, but not replace missing use-case specs.
- Do not claim production/beta readiness from green unit tests alone when the risk is migration history, runtime durability, source live evidence or auth boundary.
