# Iteration 00 - Implementation Backlog

## Purpose

Create the architecture contract before writing production code. This iteration prevents the MVP from becoming a single-user script that later needs a rewrite.

## Backend Domain Backlog

1. Define core bounded contexts: Identity, Workspace, Topic, Source Catalog, Subscription, Ingestion, Feed, Summarization, Notification, Billing/Quota, Audit.
2. Define aggregate ownership:
   - `Workspace` owns tenant membership and settings.
   - `Topic` owns monitoring intent and summary rules.
   - `SourceBinding` owns source-specific monitoring configuration.
   - `ScanPolicy` owns interval, freshness and budget constraints.
   - `SummaryPolicy` owns output style, language, citations and exclusions.
3. Define value objects: `TenantId`, `UserId`, `TopicId`, `SourceId`, `ProviderKey`, `ScanInterval`, `CursorToken`, `CanonicalUrl`, `ContentHash`, `SummaryRuleSet`.
4. Define domain events: `TopicCreated`, `SourceBindingEnabled`, `ScanScheduled`, `SourceItemObserved`, `FeedItemDeduplicated`, `SummaryRequested`, `SummaryCompleted`, `DeliveryRequested`.
5. Define invariants:
   - A scan must belong to one tenant.
   - A source binding cannot run without a capability profile.
   - Summary output must be traceable to source item IDs.
   - User rules cannot bypass platform safety/legal source restrictions.
6. Freeze MVP aggregate cutline before implementation:
   - build now: `Workspace`, `Topic`, `SourceBinding`, `ScanPolicy`, `ScanJob`, `SourceItem`, `FeedItem`, `SummaryArtifact`, `DeliveryAttempt`, `UsageRecord`
   - registry/config now: `SourceCatalogEntry`, `CapabilityProfile`
   - defer: semantic clusters, source marketplace, enterprise org hierarchy, full billing plan engine, admin impersonation, complex notification graph
7. Add aggregate tests for:
   - tenant/workspace scope required by repository methods
   - topic disabled state and queued scan behavior
   - source binding capability and credential readiness
   - scan interval/source-limit/quota validation
   - cursor commit after durable item persistence
   - feed dedupe stability when provider metadata changes
   - final summary citation requirement
   - delivery idempotency
   - append-only usage records

## MVP Domain Cutline Rules

1. Do not create `SocialPost` as a universal aggregate. Use `SourceItem` for normalized provider observation and `FeedItem` for user-visible dedupe.
2. Do not let `Topic` own provider cursor or scan retry state. That belongs to `ScanPolicy`/`ScanJob`.
3. Do not let `SummaryArtifact` mutate feed or source item state. It references evidence and records output quality.
4. Do not let Delivery generate summaries or infer business relevance. It delivers already accepted artifacts/status.
5. Do not let Billing/Usage directly mutate topic/source/feed records. It answers quota checks and records append-only usage evidence.
6. Do not design post-MVP aggregates into the first implementation unless they remove immediate rewrite risk.

## Contracts Backlog

1. Create ADR template.
2. Create OpenAPI style guide.
3. Create event schema style guide.
4. Create gRPC style guide for internal APIs.
5. Create provider adapter certification checklist.
6. Create source risk classification: official API, open API, RSS, licensed provider, export/import, browser/manual capture, rejected.
7. Define versioning rules for REST, events and connector capability profiles.

## Frontend Architecture Backlog

1. Define Flutter feature slice layout:
   - `features/topic`
   - `features/source_binding`
   - `features/feed`
   - `features/summary`
   - `features/notification`
   - `features/settings`
2. Define per-feature layers: domain, application, infrastructure, presentation.
3. Define MobX store responsibilities: state orchestration only, no raw HTTP and no domain invariants.
4. Define generated REST client boundary.
5. Define error display vocabulary for source failures, quota failures, summary failures and sync failures.

## Infrastructure Backlog

1. Decide local development topology.
2. Decide service boundaries for MVP and boundaries that remain modular but not separately deployed yet.
3. Define local observability baseline: logs, traces, metrics, correlation IDs.
4. Define environment strategy: local, test, staging, production.
5. Define secret categories and rotation requirements.

## Test Backlog

1. Define unit test rules for domain and use cases.
2. Define contract tests for REST and events.
3. Define connector certification tests.
4. Define end-to-end MVP flow test.
5. Define architecture tests that prevent forbidden imports across layers.

## Edge Cases To Capture

- User changes topic rules while a scan is running.
- Two tenants subscribe to the same public source query.
- A source is removed or becomes paid/limited after implementation.
- A provider returns partial data but no hard error.
- Summary rules request unsupported language, format or citation style.
- Mobile app opens stale cached data after source permissions changed.

## Done Means

- Bounded contexts are named and owned.
- MVP source strategy is legal and production-safe.
- Every future implementation ticket can reference a context, port, adapter and contract.
