# Iteration 00 - Phase Step Matrix

## Phase 01 - Product Domain Scope

### Build Steps

1. Write the one-sentence product definition.
2. Write the MVP user story for a personal user.
3. Write the MVP user story for a future team workspace.
4. Define the end-to-end product loop.
5. Define supported first-wave sources.
6. Define rejected/deferred source categories.
7. Define user-visible source limitation language.
8. Define first beta success metric.

### Dependencies

- Source research memory docs.
- Product scope agreement.
- MVP source priority matrix.

### Edge Cases

- The user expects "all social networks".
- Source has official API but commercial terms are unclear.
- Source is technically fetchable but not production-safe.
- Personal-use workflow conflicts with future multi-tenant SaaS needs.

### Validation

- Scope can be explained without naming implementation details.
- Every source category has a decision: build, buy, defer or reject.
- MVP can be completed without broad scraping.

## Phase 02 - Bounded Context Map

### Build Steps

1. List bounded contexts.
2. List aggregate roots.
3. Map commands to use cases.
4. Map events to producers/consumers.
5. Mark synchronous vs asynchronous integrations.
6. Mark database ownership.
7. Mark frontend feature slices.

### Dependencies

- Product scope.
- Architecture standards.

### Edge Cases

- One entity appears to belong to two contexts.
- Billing/usage is needed before paid billing exists.
- Admin tooling needs access without becoming a god service.

### Validation

- Each domain object has one owner.
- Every cross-context interaction has an integration style.
- No context depends on provider-specific DTOs.

## Phase 03 - Architecture Standards

### Build Steps

1. Define layer rules.
2. Define dependency direction.
3. Define shared kernel limits.
4. Define test categories.
5. Define error taxonomy.
6. Define id/time policy.
7. Define event envelope.
8. Define source adapter rules.

### Dependencies

- Bounded context map.

### Edge Cases

- Framework decorators leak into domain.
- Repository returns persistence models as domain entities.
- Use case catches raw HTTP/provider exceptions.

### Validation

- Rules are enforceable in code review and CI.
- New source adapter placement is obvious.

## Phase 04 - Contract-First Planning

### Build Steps

1. Define REST/OpenAPI resources.
2. Define event contracts.
3. Define gRPC proto usage criteria.
4. Define Flutter client generation.
5. Define source provider contract.
6. Define API versioning.
7. Define contract drift checks.

### Dependencies

- Architecture standards.
- Frontend architecture decision.

### Edge Cases

- Frontend needs a field absent from OpenAPI.
- Event version changes break a worker.
- Provider capability changes after tenant setup.

### Validation

- API and event contracts can be generated/tested before UI is complete.
- Flutter app can rely on generated clients, not handwritten DTOs.

