# Iteration 00 - Detailed Execution Plan

## Purpose

This file turns the foundation iteration into an execution checklist.

Do not start implementation until this iteration is accepted. Every later phase depends on the domain vocabulary, source policy and architecture boundaries defined here.

## Phase 01 - Product Domain Scope

### Steps

1. Define the product as `multi-tenant social intelligence`, not as `social scraper`.
2. Write the canonical user journey:
   `workspace -> topic -> source binding -> scan policy -> feed -> summary -> alert`.
3. Define MVP personas:
   - personal researcher/founder
   - small SaaS team
   - later agency/team workspace
4. Define first useful MVP sources:
   - Hacker News
   - RSS/open web
   - GitHub
   - Reddit only if official/commercial access is clear
   - YouTube basic only with quota policy
5. Define explicitly deferred sources:
   - X/Twitter broad monitoring unless paid/vendor path exists
   - LinkedIn, Meta, TikTok broad listening
   - regional China/Taiwan sources except vendor/enterprise path
6. Define product modules:
   - topic setup
   - source setup
   - scan status
   - feed triage
   - summary generation
   - digest/alert
   - source health
7. Define what is not MVP:
   - universal scraping
   - enterprise SSO
   - fully automated billing
   - all source networks
   - complex CRM workflows

### Edge Cases

- User wants unsupported source before MVP source loop is stable.
- User expects full internet coverage from a keyword.
- User thinks summary is source truth.
- User adds a topic so broad it creates high cost and noisy results.
- User monitors a term that appears in many unrelated contexts.

### Attention Points

- Every feature must answer: "which tenant, which topic, which source, which policy?"
- Keep source limitations visible from the start.
- Avoid promising "scans social media" without source qualifiers.

### Acceptance Gate

- MVP scope can be explained in one page.
- Deferred sources have explicit reasons.
- First beta workflow is concrete enough to implement.

## Phase 02 - Bounded Context Map

### Steps

1. Draw bounded contexts:
   - IdentityAccess
   - TopicMonitoring
   - SourceIngestion
   - FeedIntelligence
   - Delivery
   - BillingUsage
   - AdminGovernance
2. Define upstream/downstream relationships.
3. Define aggregate roots:
   - Tenant
   - User
   - Topic
   - SourceBinding
   - ScanJob
   - SourceItem
   - SummaryArtifact
   - DeliveryAttempt
4. Define domain events:
   - TopicCreated
   - SourceBindingEnabled
   - ScanRequested
   - ScanCompleted
   - SourceItemIngested
   - SummaryRequested
   - SummaryCompleted
   - DigestScheduled
5. Define invariants per aggregate.
6. Define which context owns each database table.
7. Define context integration style:
   - REST for frontend/backend
   - events for async state changes
   - gRPC only for internal synchronous calls that must be synchronous

### MVP Aggregate Cutline

Build these aggregates first:

1. `Workspace` for tenant boundary and membership.
2. `Topic` for monitoring intent and enabled state.
3. `SourceBinding` for selected source, capability snapshot and credential reference.
4. `ScanPolicy` for interval, freshness and quota preflight.
5. `ScanJob` for execution lifecycle, lease and cursor checkpoint intent.
6. `SourceItem` for normalized observed provider item and provenance.
7. `FeedItem` for deduplicated user-visible item.
8. `SummaryArtifact` for cited AI output and feedback status.
9. `DeliveryAttempt` for realtime/digest/webhook attempt idempotency.
10. `UsageRecord` for cost/quota evidence.

Defer these until beta evidence exists:

1. semantic cluster aggregate
2. source marketplace aggregate
3. enterprise organization/department hierarchy
4. billing plan/subscription engine
5. admin impersonation model
6. complex notification preference graph
7. multi-region routing model

### Invariant Checklist

1. `Workspace`: all workspace-owned records require tenant/workspace scope in repository signatures.
2. `Topic`: disabled topic cannot schedule new scans, but already running jobs must finish or be cancelled through explicit policy.
3. `SourceBinding`: enabled binding must have allowed acquisition mode, capability profile and valid credential state when auth is required.
4. `ScanPolicy`: interval must satisfy platform minimum, source limits and tenant quota.
5. `ScanJob`: retry cannot exceed budget; cursor commit cannot happen before durable item persistence.
6. `SourceItem`: provider DTO cannot leak into domain object; provenance must identify source, provider item id or canonical URL, and observed time.
7. `FeedItem`: dedupe key must stay stable across mutable provider metadata.
8. `SummaryArtifact`: final summary must include citations, prompt/model version and schema version.
9. `DeliveryAttempt`: retry must reuse idempotency key and preserve original correlation id.
10. `UsageRecord`: usage evidence is append-only and tenant-scoped.

### Edge Cases

- Summary needs item data from SourceIngestion but should not own source item mutation.
- Delivery needs topic settings but should not mutate topic rules.
- Billing needs usage events but should not control scan execution directly.
- Source binding is disabled while a scan is mid-flight.
- Scan policy changes while old jobs are already queued.
- Same provider item appears under multiple source bindings.
- Provider capability profile changes after a source binding was created.
- Summary is generated from items that later become hidden or excluded.

### Attention Points

- Avoid an anemic `SocialPost` object that handles everything.
- Keep review/rating/video/event sources as source families, not special hacks.
- Keep aggregates small and behavior-focused. If a field is only needed by an adapter, it should not enter the domain model.
- Model source variability through `CapabilityProfile`, `SourceBinding` config and adapter ports, not through provider-specific branches in use cases.
- Use domain events for lifecycle transitions, but avoid a heavyweight saga framework until the simple outbox/job flow proves insufficient.

### Acceptance Gate

- Every use case has a bounded context owner.
- No context has vague ownership of "everything related to sources".
- MVP aggregate list is frozen enough to start implementation.
- Each aggregate invariant has a planned unit or use-case test.
- Deferred aggregates are recorded as post-MVP, not silently designed into the first release.

## Phase 03 - Architecture Standards

### Steps

1. Define Clean Architecture layers:
   - domain
   - application/use cases
   - ports
   - adapters
   - interface/controllers
2. Define dependency rules:
   - domain imports nothing framework-specific
   - use cases import ports and domain only
   - adapters implement ports
   - controllers map API DTOs to commands
3. Define SOLID expectations:
   - one use case per business operation
   - provider adapters only implement provider-specific behavior
   - source capability branching happens through capability profile, not `if providerName`
4. Define error taxonomy:
   - domain error
   - policy error
   - provider error
   - infrastructure error
   - validation error
5. Define ID/time policy:
   - UUIDv7 or documented id strategy
   - UTC storage
   - fake clock in tests
6. Define test strategy:
   - domain unit tests
   - use case tests with fake ports
   - adapter contract tests
   - e2e only for critical flows

### Edge Cases

- Provider adapter wants to throw raw HTTP error into use case.
- Controller starts implementing business logic.
- Prisma entity becomes domain entity.
- Kafka event shape drifts from domain event shape.

### Attention Points

- Ban provider DTO leakage early.
- Enforce import boundaries in CI.
- Do not create huge shared utility libraries.

### Acceptance Gate

- Architecture rules are enforceable with lint/tests.
- New developer can place a new class in the correct layer without guessing.

## Phase 04 - Contract-First Planning

### Steps

1. Define OpenAPI resource model.
2. Define event envelope and event names.
3. Define source provider contract.
4. Define Flutter generated client workflow.
5. Define API versioning.
6. Define event versioning.
7. Define backward compatibility expectations.
8. Define contract test process.

### Edge Cases

- Frontend needs field not present in API contract.
- Event consumer deploys before producer.
- Source capability changes after source is enabled for tenants.
- API returns null where generated Flutter model expects non-null.

### Attention Points

- OpenAPI is a product contract, not generated afterthought.
- Event payloads need tenant id, correlation id and schema version.

### Acceptance Gate

- OpenAPI, event envelope and source contract are ready for implementation.
- Contract drift has a defined CI check.
