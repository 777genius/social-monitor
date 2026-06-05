# Iteration 00 - Ticket Breakdown

## Phase 01 - Product Domain Scope

### T00-01 - Define MVP Product Loop

- Context: Product/Foundation
- Layer: Domain planning
- Artifacts: MVP loop diagram, glossary, scope decision record
- Steps:
  1. Write the canonical loop: workspace -> topic -> source binding -> scan -> feed -> summary -> delivery.
  2. Define user-visible nouns and backend domain nouns.
  3. Mark non-goals: unsafe scraping, unmanaged personal account automation, enterprise billing.
  4. Document which workflows are mandatory for beta.
- Edge cases:
  - User expects broad social coverage before stable connector foundation.
  - MVP scope expands into unreleasable platform.
- Acceptance:
  - Every later ticket maps to one part of the loop.

### T00-02 - Define Source Acquisition Policy

- Context: Source Catalog/Ingestion
- Layer: Domain policy
- Artifacts: source risk classes, allowed acquisition modes, rejected modes
- Steps:
  1. Classify official API, open API, RSS, licensed provider, export/import and manual research capture.
  2. Mark browser automation and bot-detection avoidance as not production-safe.
  3. Define required metadata for every source adapter.
  4. Define review gate for adding Twitter/X, Reddit, Telegram and future sources.
- Edge cases:
  - Provider changes API pricing or access rules.
  - A source works technically but violates ToS or reliability standards.
- Acceptance:
  - Connector tickets cannot start without source risk classification.

## Phase 02 - Bounded Context Map

### T00-03 - Model Bounded Context Ownership

- Context: Platform
- Layer: Domain architecture
- Artifacts: bounded context map, aggregate ownership table
- Steps:
  1. Define Identity, Workspace, Topic, Source Catalog, Ingestion, Feed, Summarization, Notification, Audit.
  2. Assign aggregate roots and invariants.
  3. Define cross-context dependencies as events or APIs.
  4. Identify contexts that can start as modules and later become services.
- Edge cases:
  - Feed starts depending directly on provider payloads.
  - Summary context mutates ingestion state.
- Acceptance:
  - No aggregate is owned by two contexts.

## Phase 03 - Architecture Standards

### T00-04 - Write Clean Architecture Import Rules

- Context: Platform
- Layer: Architecture governance
- Artifacts: import rules, architecture test plan
- Steps:
  1. Define domain dependency restrictions.
  2. Define use case to port dependencies.
  3. Define adapter boundaries.
  4. Define frontend feature-scoped rules.
- Edge cases:
  - NestJS decorators leak into domain.
  - MobX stores become domain services.
- Acceptance:
  - Rules are concrete enough to enforce in tests.

## Phase 04 - Contract-First Planning

### T00-05 - Define Contract Versioning Standards

- Context: Contracts
- Layer: API/events
- Artifacts: OpenAPI rules, event envelope rules, gRPC rules
- Steps:
  1. Define REST DTO naming and error shape.
  2. Define event envelope and schema versioning.
  3. Define internal gRPC use cases.
  4. Define compatibility policy.
- Edge cases:
  - Mobile app lags backend release.
  - Consumer reads old event version.
- Acceptance:
  - Contract changes have a documented compatibility path.
