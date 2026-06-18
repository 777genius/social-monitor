# Social Monitor Claude Rules

Social Monitor is a backend/API-first NestJS and TypeScript monitoring platform. Treat this repository as a Clean Architecture codebase with DDD bounded contexts, explicit ports/adapters, generated contracts and executable release gates.

Load the project quality rules before changing code:

@.claude/rules/quality-architecture.md

## Working Rules

- Read the current code and the nearest architecture docs before changing a module.
- Keep changes scoped to the requested bounded context and use case.
- Do not add feature code by bypassing ports, adapters, runtime selectors, tenant scope or contract gates.
- Prefer small vertical slices with focused tests over broad speculative rewrites.
- Do not manually edit generated clients, Prisma generated output or OpenAPI snapshots except through the documented generator/check command.
- Do not run agent launch/provisioning/terminal-runtime/task-assignment smoke flows on real user projects. Use sandbox/test projects or deterministic fixture checks.

## Required Quality Bar

- Domain code imports only domain-safe dependencies and shared kernel.
- Feature use cases depend on ports and domain objects, not NestJS, Prisma, RabbitMQ, SDK clients, DTOs or in-memory adapters.
- Ports are inner-boundary abstractions and must not read `process.env` or import adapters, interfaces, frameworks or public contracts.
- Interfaces/controllers map transport input to commands and must enforce tenant/workspace/auth boundaries before invoking use cases.
- Adapters own infrastructure details and must not leak ORM/SDK DTOs into domain, features or public contracts.
- Runtime adapter choices must go through resolver functions and keep `npm run check:runtime-profile-guards` green.
- Apps and composition roots import `libs` through `@social-monitor/...` aliases, never deep-relative `../../../libs/...` paths.
- Runtime configuration belongs in config/provider-token/composition code, not hidden inside adapters, domain or feature use cases.
- Interface controllers, gateways, support services and authorizers receive env-derived config through provider tokens, not direct `process.env` reads.
- Trusted workspace-role header parsing goes through `WorkspaceRoleHeaderParser`, never repeated controller env checks.
- Public contract knowledge belongs behind ports when application use cases need it.
- Do not introduce runtime circular dependencies. Split boundaries through ports or shared domain primitives instead.
- Source/provider changes must keep fixture readiness and live beta readiness explicit.
- API changes must keep OpenAPI, generated clients and error contracts fresh.
- Dependency changes must check the current stable version and keep `npm audit --audit-level=moderate` and `npm run check:dependencies` green.
- Project Claude hooks are active in `.claude/settings.json`. They block prohibited real-project agent/runtime commands, include `TaskCreated`/`Agent` coverage, respect `stop_hook_active` and keep architecture/code-quality rules from becoming prose-only.
- Project Claude permissions and hooks block `.env`, `.envrc`, `.npmrc`, `.netrc`, cloud/kube/GitHub config, secret directories, private keys, credential CLIs, network CLIs and destructive reset commands. Do not bypass that through Bash subprocesses.
- User-controlled outbound URLs use the shared-kernel outbound URL policy for SSRF protection, and HTTP adapters use `AbortSignal.timeout` for live provider calls.

## Before Claiming Done

Run the smallest checks that prove the changed surface:

- Architecture or dependency-direction change: `npm run check:architecture` and `npm run check:code-quality`.
- Runtime/env/provider-token change: `npm run check:runtime-profile-guards`, plus the affected persistence/queue check.
- Contract/API/client change: `npm run check:openapi`, `npm run check:mobile-client-contract` and Flutter client check when Dart is available.
- Source/provider change: `npm run check:source-certification` and affected source smoke.
- Security/dependency change: `npm audit --audit-level=moderate` and `npm run check:dependencies`.
- Agent/Claude rule change: `npm run check:agent-quality-rules` and `npm run check:claude-hooks`.

If full `npm run verify` would run prohibited real-project smoke/runtime flows in the current environment, do not run it. State which focused checks were run instead.
