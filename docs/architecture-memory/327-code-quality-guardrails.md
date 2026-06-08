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
10. Architecture boundaries remain separately enforced by `npm run check:architecture`.

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
- Evidence docs must be updated from temporary branch markers to concrete commit SHAs before merge.

## MVP Boundary

This gate does not replace full integration or e2e coverage. It protects the highest-risk structural rules cheaply. Post-MVP gates should add repository integration coverage, broker contract tests and real provider certification.
