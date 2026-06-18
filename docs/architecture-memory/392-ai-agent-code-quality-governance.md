# 392 - AI Agent Code Quality Governance

## Status

Locked for agent-assisted implementation.

## Research Anchors

- Claude Code memory and rules: https://code.claude.com/docs/en/memory
- Claude Code hooks: https://code.claude.com/docs/en/hooks-guide
- Clean Architecture dependency rule: https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
- Dependency graph cycle enforcement: https://github.com/sverweij/dependency-cruiser
- TypeScript project references for logical separation: https://www.typescriptlang.org/docs/handbook/project-references.html
- ESLint import restrictions limitation: https://eslint.org/docs/latest/rules/no-restricted-imports
- Existing project gate: `docs/architecture-memory/327-code-quality-guardrails.md`

## Finding

The previous weak spots were not random bugs. They were quality-policy failures that were easy for an agent to miss when the rule was not loaded into context or not executable:

- dependency audit stayed red while feature work could continue;
- beta runtime could still select process-local adapters outside the compose path;
- source readiness language mixed fixture certification and live beta readiness;
- generated mobile client contract was not compiled as a consumer artifact;
- trusted workspace-role headers needed a stricter dev-only boundary;
- request/correlation id generation was duplicated across controllers instead of centralized in transport infrastructure;
- API gateway health/readiness mixed endpoint code with env, uptime and wall-clock reads;
- pagination limit parsing was duplicated across REST controllers and sometimes allowed invalid public query values to leak into use cases;
- API gateway readiness imported source adapter data directly instead of receiving adapter-backed readiness data through a composition-root provider;
- secret/token redaction logic was duplicated across problem details, structured logs, audit metadata and source config protection;
- platform queue root exports exposed RabbitMQ and InMemory adapter implementations beside core queue ports, which made composition-root shortcuts look like stable inner APIs;
- platform events kept a legacy in-memory adapter shortcut outside `adapters/in-memory`, which made adapter imports inconsistent across queue/event platform modules;
- several adapters hid time/id dependencies through `SystemClock`/`CryptoIdGenerator` constructor defaults instead of requiring composition roots to provide them;
- user-controlled outbound URL safety was duplicated in RSS code and not enforced for webhook endpoints, which left an SSRF gap for private/link-local/cloud metadata targets;
- one live source HTTP client performed outbound `fetch` without `AbortSignal.timeout`, which could hang worker progress on a slow provider;
- migration history and tenant database guard checks needed executable evidence.

The codebase already had strong architecture docs and many checks, but no root `CLAUDE.md` or `.claude/rules/` quality rules for Claude Code. That meant future Claude sessions could ignore project-specific Clean Architecture decisions unless the user repeated them.

## Decision

Commit agent-facing rules and make their presence an executable quality gate.

- Root `CLAUDE.md` gives concise project-level instructions that Claude Code loads every session.
- `.claude/rules/quality-architecture.md` holds Clean Architecture, SOLID, DRY, runtime, contract, tenant and source readiness rules.
- `.claude/settings.json` wires Claude Code hooks for deterministic enforcement.
- `npm run check:agent-quality-rules` verifies that the rules exist, stay concise, mention required gates and remain wired into `npm run verify`.
- `npm run check:claude-hooks` verifies hook behavior with synthetic JSON input only, including `TaskCreated`, `Agent` and `stop_hook_active` handling.
- Deterministic rules still belong in scripts and tests. Agent memory is guidance; checks are enforcement.

## Rules For Future Feature Growth

1. No new feature starts by editing adapters/controllers only. First identify domain/use-case/port boundaries.
2. No new source/provider is beta-bindable until readiness, fixture certification and live-beta blockers are explicit.
3. No new runtime selector exists without beta fail-fast coverage.
4. No generated client or OpenAPI contract changes land without freshness and consumer compile checks.
5. No persistence/schema changes land without migration and tenant guard evidence.
6. No dependency change lands without current-version check and audit evidence.
7. No auth-related endpoint trusts client-supplied role headers outside dev/test mode.
8. No broad abstraction is added only to make code look DRY. The abstraction must remove real shared behavior with the same reason to change.
9. No feature/domain code imports public contract packages directly. Use a port and contract-backed adapter.
10. No adapter or port reads `process.env`; runtime config is passed in through provider-token/composition code.
11. No production file grows past its line budget without splitting responsibilities or adding an explicit temporary budget.
12. Claude Code hooks are enforcement for agent behavior. `PreToolUse` blocks prohibited real-project agent/runtime commands and secret paths, `TaskCreated` blocks real-project task assignment and `Stop` keeps quality gates from being skipped while respecting `stop_hook_active`.
13. Wall-clock time and generated identity are dependencies. Feature/use-case code, adapters, platform queue publishers and worker loops use `Clock`, `IdGenerator` or platform command-id helpers instead of ad hoc `Date.now()` strings or adapter defaults that instantiate `SystemClock`/`CryptoIdGenerator`.
14. Hook behavior must be executable. `npm run check:claude-hooks` uses synthetic hook payloads only and must not launch agents, provision runtimes or open terminal runtime flows.
15. Architecture boundary checks must cover static imports, re-exports, `require(...)` and dynamic `import(...)`; agents cannot bypass dependency rules by changing import syntax.
16. Claude hook commands must use `command` + `args` with `${CLAUDE_PROJECT_DIR}`, and Stop hooks must chdir to the project root before running npm gates, so cwd changes or shell quoting cannot disable enforcement.
17. Claude permissions and hooks must fail closed for secrets: `.env`, `.envrc`, `.npmrc`, `.netrc`, cloud/kube/GitHub config, credential directories and private keys are denied for built-in file tools, while PreToolUse blocks Bash subprocess secret reads, credential/network CLIs and destructive reset commands.
18. Claude policy hooks fail closed on malformed hook JSON. Blocking hook failures use exit code 2, because ordinary process failures are not enforcement decisions.
19. Feature use cases return `Result` for expected application/provider validation failures. Generic exceptions are for unexpected infrastructure faults only.
20. Production runtime imports cannot form circular dependencies. Break cycles by extracting ports, shared domain primitives or one-way mappers.
21. Apps import bounded-context code through `@social-monitor/...` aliases. No deep-relative `../../../libs/...` paths or relative cross-context imports; those are boundary bypasses.
22. Interface controllers, gateways, support services and authorizers receive env-derived config through provider tokens. Direct `process.env` reads belong in composition/provider-token files, not transport or reusable services.
23. Trusted workspace-role header parsing uses `WorkspaceRoleHeaderParser`, so dev-only auth config stays centralized and runtime-profile guarded.
24. Request/correlation ids in REST and gateway code use `RequestCorrelationIdFactory`; direct `randomUUID()` is restricted to `CryptoIdGenerator`.
25. App controllers stay transport-only. Health/readiness snapshots use provider-backed reporters for env, clock and uptime.
26. REST pagination limits use platform `parsePaginationLimit` helpers, not local `parseLimit` or `Number(limitQuery)`.
27. REST controllers use `async`/`await` so authorization, use-case calls and result mapping remain linear and reviewable.
28. App services, controllers and reporters do not import bounded-context adapters directly; composition roots may import adapters and pass adapter-backed readiness data through provider tokens.
29. Platform root barrels expose core ports/primitives only. They do not re-export `./adapters/*`, RabbitMQ, InMemory, Prisma or SDK implementation files; composition roots import platform queue/event adapters through explicit adapter subpaths and never legacy adapter shortcuts.
30. Secret and token redaction policy lives in shared-kernel redaction helpers. Do not duplicate sensitive-key/string regexes in filters, loggers, audits or adapters.
31. User-controlled outbound URLs use the shared-kernel outbound URL policy. Do not duplicate `blockedHosts`/`isPrivateIp` logic in adapters, domains or fake catalogs.
32. Webhook/RSS/feed URLs must block localhost, private, carrier-grade NAT, link-local, multicast and metadata-service targets to reduce SSRF risk. Redirect destinations must be revalidated before content is accepted.
33. HTTP adapters must use `AbortSignal.timeout` for outbound `fetch` calls; live provider/webhook calls cannot hang worker loops indefinitely.

## Review Checklist

- Did the change preserve dependency direction?
- Did every new public path enforce tenant/auth scope?
- Did the changed behavior gain focused tests or an existing targeted check?
- Did beta runtime stay durable by default?
- Did user-controlled outbound URL or HTTP fetch changes keep SSRF and timeout guards green?
- Did docs and generated artifacts stay consistent with code?
- Did the final response state exactly which checks ran and which were intentionally skipped?

## Why This Exists

Claude Code documentation treats `CLAUDE.md` and project rules as context, not hard enforcement. It also recommends hooks/checks for deterministic control. This project therefore keeps architecture guidance in Claude rules and enforces high-risk invariants through npm checks.
