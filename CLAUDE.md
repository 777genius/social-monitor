# Social Monitor Claude Rules

Social Monitor is a backend/API-first NestJS and TypeScript monitoring platform. Treat this repository as a Clean Architecture codebase with DDD bounded contexts, lightweight-to-expanded DDD feature folders, explicit inner contracts, generated contracts and executable release gates.

Load the project quality rules before changing code:

@.claude/rules/quality-architecture.md
@.claude/rules/ddd-clean-architecture-folders.md
@.claude/rules/flutter-frontend-quality.md
@.claude/rules/flutter-clean-disk-deep-lessons.md

## Working Rules

- Read the current code and the nearest architecture docs before changing a module.
- Read the local feature `AGENTS.md` before changing any frontend feature.
- Keep changes scoped to the requested bounded context and use case.
- Do not add feature code by bypassing domain/application contracts, infrastructure boundaries, runtime selectors, tenant scope or contract gates.
- Prefer small vertical slices with focused tests over broad speculative rewrites.
- Do not manually edit generated clients, Prisma generated output or OpenAPI snapshots except through the documented generator/check command.
- Do not run agent launch/provisioning/terminal-runtime/task-assignment smoke flows on real user projects. Use sandbox/test projects or deterministic fixture checks.

## Required Quality Bar

- Domain code imports only domain-safe dependencies and shared kernel.
- New feature work should model bounded contexts, ubiquitous language, aggregates, entities, value objects, domain events, policies/specifications, repositories, domain services and application use cases explicitly when the behavior needs them.
- Feature use cases depend on domain objects and domain/application contracts, not NestJS, Prisma, RabbitMQ, SDK clients, DTOs or in-memory implementations.
- Inner contracts are Clean Architecture ports by role. They must not read `process.env` or import infrastructure implementations, interfaces, frameworks or public contracts.
- Interfaces/controllers map transport input to commands and must enforce tenant/workspace/auth boundaries before invoking use cases.
- Infrastructure implementations own external details and must not leak ORM/SDK DTOs into domain, features or public contracts.
- Runtime adapter choices must go through resolver functions and keep `npm run check:runtime-profile-guards` green.
- Apps and composition roots import `libs` through `@social-monitor/...` aliases, never deep-relative `../../../libs/...` paths.
- Runtime configuration belongs in config/provider-token/composition code, not hidden inside infrastructure implementations, domain or feature use cases.
- Interface controllers, gateways, support services and authorizers receive env-derived config through provider tokens, not direct `process.env` reads.
- Trusted workspace-role header parsing goes through `WorkspaceRoleHeaderParser`, never repeated controller env checks.
- Public contract knowledge belongs behind domain/application contracts when use cases need it.
- Do not introduce runtime circular dependencies. Split boundaries through inner contracts or shared domain primitives instead.
- Source/provider changes must keep fixture readiness and live beta readiness explicit.
- API changes must keep OpenAPI, generated clients and error contracts fresh.
- Dependency changes must check the current stable version and keep `npm audit --audit-level=moderate` and `npm run check:dependencies` green.
- Human-written source and test files have a hard 1000 LOC cap. Generated/build/vendor outputs are excluded; existing legacy debt in `scripts/check-source-line-cap.mjs` may only shrink and cannot receive new behavior without splitting.
- Project Claude hooks are active in `.claude/settings.json`. They block prohibited real-project agent/runtime commands, include `TaskCreated`/`Agent` coverage, respect `stop_hook_active` and keep architecture/code-quality rules from becoming prose-only.
- Project Claude permissions and hooks block `.env`, `.envrc`, `.npmrc`, `.netrc`, cloud/kube/GitHub config, secret directories, private keys, credential CLIs, network CLIs and destructive reset commands. Do not bypass that through Bash subprocesses.
- User-controlled outbound URLs use the shared-kernel outbound URL policy for SSRF protection, and HTTP infrastructure implementations use `AbortSignal.timeout` for live provider calls.

## Before Claiming Done

Run the smallest checks that prove the changed surface:

- Architecture or dependency-direction change: `npm run check:architecture`, `npm run check:code-quality` and `npm run check:source-line-cap`.
- Runtime/env/provider-token change: `npm run check:runtime-profile-guards`, plus the affected persistence/queue check.
- Contract/API/client change: `npm run check:openapi`, `npm run check:mobile-client-contract` and Flutter client check when Dart is available.
- Frontend architecture or design-system change: from `apps/frontend`, run `fvm flutter analyze`, `fvm flutter test app/test/architecture/frontend_architecture_boundaries_test.dart` and the affected app/package tests.
- Frontend shared-kernel or generated-client change: from `apps/frontend`, also run `fvm dart test packages/shared_kernel packages/generated_api`.
- Source/provider change: `npm run check:source-certification` and affected source smoke.
- Security/dependency change: `npm audit --audit-level=moderate` and `npm run check:dependencies`.
- Agent/Claude rule change: `npm run check:agent-quality-rules` and `npm run check:claude-hooks`.

If full `npm run verify` would run prohibited real-project smoke/runtime flows in the current environment, do not run it. State which focused checks were run instead.
