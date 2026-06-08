# 327. Code Quality Guardrails

## Status

Locked for MVP implementation.

## Decision

Code quality rules must be enforceable, not only documented. `npm run verify` must include a fast code-quality gate before expensive build/test steps, so structural regressions fail early.

## Enforced Rules

1. Every production feature use case under `libs/**/features/**/*.use-case.ts` must have a focused sibling `*.use-case.spec.ts`.
2. Feature use cases return `Result` failures with `err(new DomainError(...))`; they must not throw `DomainError` directly.
3. Feature use cases depend on ports and must not instantiate concrete `InMemory*` adapters.
4. Tenant-scoped REST controllers must call `requireTenantScope(...)` before invoking application use cases.
5. Public catalog controllers must be explicitly allowlisted in `scripts/check-code-quality.mjs`.
6. Production code in `apps` and `libs` must not use `console.*`; logging must go through structured platform logging ports/adapters.
7. Architecture boundaries remain separately enforced by `npm run check:architecture`.

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

## Why This Exists

Clean Architecture fails slowly when use cases stop being directly testable, controllers skip tenant scope, or application code starts depending on adapters. These are high-leverage quality failures, so they are checked by script instead of relying on reviewer memory.

## Reviewer Policy

- A new use case without a sibling spec is blocked.
- A REST endpoint without tenant/workspace scoping is blocked unless the endpoint is a deliberate public catalog endpoint and the allowlist is updated in the same PR.
- A direct infrastructure dependency in a feature is blocked.
- A production `console.*` call is blocked.
- A smoke script can supplement e2e, but it cannot replace a missing use-case spec.

## MVP Boundary

This gate does not replace full integration or e2e coverage. It protects the highest-risk structural rules cheaply. Post-MVP gates should add repository integration coverage, broker contract tests and real provider certification.
