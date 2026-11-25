# Iteration 01 / Phase 01 - Monorepo Scaffold

## Objective

Create the NestJS/TypeScript monorepo skeleton with enforceable boundaries.

## Steps

1. Initialize monorepo with apps and libs.
2. Create apps: `api-service`, `worker-service`, `realtime-service` placeholder.
3. Create libs by bounded context and layer.
4. Add shared kernel with no framework dependencies.
5. Configure TypeScript paths and boundary lint rules.
6. Add formatting, linting, test runner and CI skeleton.

## Edge Cases

- Circular dependency between contexts.
- Framework decorators in domain layer.
- Shared lib grows uncontrolled.
- Tests import infrastructure accidentally.

## Pay Attention

- Use apps only as composition roots.
- Keep domain classes framework-free.
- Prefer small libraries over one giant module.

## Acceptance Criteria

- `pnpm test/lint/typecheck` works.
- Boundary rules fail on forbidden imports.
- Apps boot with empty health endpoint.
- Domain libs have no NestJS dependency.
