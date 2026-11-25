# Iteration 00 / Phase 02 - Bounded Context Map

## Objective

Define DDD bounded contexts and dependency direction.

## Steps

1. Create bounded contexts: Identity/Tenancy, Topic Management, Source Management, Scheduling, Ingestion, Feed, Summary, Delivery, Billing/Entitlements, Support/Admin.
2. Mark MVP contexts: Tenancy, Topic, Source, Scheduling, Ingestion, Feed, Summary, Realtime Status.
3. Define context relationships: upstream/downstream, events, sync queries, shared kernel.
4. Decide which contexts are libraries first and which become services later.
5. Define anti-corruption layers for source providers and AI providers.
6. Map domain events per context.
7. Classify every aggregate as global, tenant-owned or workspace-owned.
8. Define which contexts may access provider credentials and which may only see credential health/status.

## MVP Aggregate Map

| Aggregate | Ownership | Context | Responsibility | Main Ports |
| --- | --- | --- | --- | --- |
| `Workspace` | tenant-owned | Identity/Tenancy | workspace boundary, membership, role, workspace-level settings | workspace repository, audit event publisher |
| `Topic` | workspace-owned | Topic Management | monitoring intent, enabled state, rule references, source binding list | topic repository, policy validator |
| `SourceBinding` | workspace-owned | Source Management | source selection, capability profile snapshot, query/config, credential reference, health | source binding repository, credential vault port, capability registry |
| `ScanPolicy` | workspace-owned | Scheduling | interval, freshness, retry budget, quota preflight | scan policy repository, quota checker |
| `ScanJob` | workspace-owned | Scheduling/Ingestion | lease, execution lifecycle, cursor checkpoint intent, failure class | job queue port, clock, cursor store, event publisher |
| `SourceItem` | workspace-owned | Ingestion | normalized observed item, provenance, provider identity, optional raw payload pointer | source item repository, dedupe candidate publisher |
| `FeedItem` | workspace-owned | Feed | deduplicated item visible to user, topic/source linkage, status | feed repository, dedupe policy |
| `SummaryArtifact` | workspace-owned | Summary | cited output, prompt/model version, schema version, quality state, feedback link | summary repository, AI provider port, eval port |
| `DeliveryAttempt` | workspace-owned | Delivery | realtime/digest/webhook attempt, idempotency, failure classification | delivery repository, realtime/notification/webhook ports |
| `UsageRecord` | tenant-owned | Billing/Entitlements | scan, AI and delivery usage/cost evidence | usage ledger repository, quota policy |
| `SourceCatalogEntry` | global | Source Management | supported source metadata and acquisition category | source catalog repository |
| `CapabilityProfile` | global or source-versioned | Source Management | cursor, rate limit, query, media, auth and cost capabilities | capability registry |

## Core Invariants

1. `Workspace` is the root authorization boundary. No workspace-owned aggregate can be read or mutated without workspace scope.
2. `Topic` owns monitoring intent, but does not own scan execution or provider cursor state.
3. `SourceBinding` owns the selected source configuration and credential reference, but never exposes raw secrets to Feed, Summary or Delivery.
4. `ScanPolicy` is evaluated before external calls. It must include interval, freshness and quota behavior.
5. `ScanJob` records lifecycle and cursor intent. Cursor commit requires durable item persistence or a recorded terminal failure.
6. `SourceItem` stores provider provenance and normalized fields only. Provider DTOs stay inside adapters or controlled raw-payload storage.
7. `FeedItem` owns user-visible dedupe state. It must remain stable if a provider changes display title, score or author metadata.
8. `SummaryArtifact` must keep citation links to `FeedItem`/`SourceItem` evidence and cannot become final with uncited claims.
9. `DeliveryAttempt` is idempotent per channel and target. Replaying a delivery command must not duplicate user-visible notifications.
10. `UsageRecord` is append-only for MVP. Corrections are additional records, not silent edits.

## Context Interaction Rules

1. Topic Management emits topic/source policy events; it does not call provider SDKs.
2. Source Management validates capability and credential references; it does not run scans.
3. Scheduling creates scan jobs and controls retry/backoff; it does not parse provider payloads.
4. Ingestion normalizes provider data and publishes observed items; it does not generate summaries.
5. Feed deduplicates and exposes read models; it does not call AI providers.
6. Summary consumes feed/evidence and creates cited artifacts; it does not send notifications directly.
7. Delivery consumes status/artifact events and records attempts; REST/read models remain the source of truth.
8. Billing/Usage receives usage events and answers quota checks; it does not mutate domain objects in other contexts directly.

## Backend Feature Slice Rule

Each bounded context uses feature/use-case slices inside the context, not a global backend `features` folder.

Example:

```text
topic-management/
  domain/
  features/
    create-topic/
    disable-topic/
    list-topics/
  ports/
  adapters/
  interfaces/
```

Rules:

1. Features are application slices, not mini-monoliths.
2. Shared context entities, aggregates, value objects and domain events stay in `domain`.
3. Feature folders contain command/query/result/use-case/spec files.
4. Repository, provider, queue and AI abstractions stay in `ports`.
5. Prisma, queue, provider and AI implementations stay in `adapters`.
6. REST controllers, job handlers and event consumers stay in `interfaces`.
7. Cross-context calls use events, REST/gRPC contracts or explicit application ports, not private feature imports.

This keeps Feature-Sliced ergonomics without weakening DDD ownership.

## MVP Cutline

Build the aggregate map above only as far as needed for the beta loop:

- `Workspace`, `Topic`, `SourceBinding`, `ScanPolicy`, `ScanJob`, `SourceItem`, `FeedItem`, `SummaryArtifact`, `DeliveryAttempt`, `UsageRecord`.
- `SourceCatalogEntry` and `CapabilityProfile` can start as persisted config or code-backed registry if versioning is explicit.
- Do not create separate aggregates for semantic clusters, complex billing plans, source marketplaces, enterprise admin workflows or multi-region routing until beta evidence demands them.
- Keep Reddit, X/Twitter and Telegram as source readiness records unless an approved source access strategy exists.

## Edge Cases

- A source credential is both security data and source data.
- A summary references items from several sources.
- A topic rule affects scheduling cost.
- Billing limits affect scanning and AI behavior.
- A global source catalog entry is used by many tenants with different quotas and credentials.
- Support needs to inspect status without seeing raw provider credentials.
- A user disables a topic while scan jobs for that topic are leased by workers.
- A provider returns the same item under multiple URLs or aliases.
- A source capability profile changes while an existing binding still has old cursor assumptions.
- A summary is requested for feed items that later become hidden, deleted or policy-excluded.
- A delivery retry arrives after the user disabled the channel.

## Pay Attention

- Contexts should not import each other's infrastructure.
- Shared kernel must stay small: IDs, Result, Clock, domain primitives.
- Do not use "common" as a dumping ground.
- Tenant-owned aggregates should not be queried without tenant/workspace scope.
- Provider credentials belong to secure source/identity infrastructure, not to feed or summary domain models.
- Prefer a small shared kernel of IDs, result types, clocks and domain primitives only.
- If a model starts needing provider-specific fields, move that behavior back to the adapter/capability profile.
- Every cross-context event needs schema version, tenant/workspace scope, correlation id and idempotency key.

## Acceptance Criteria

- Context map exists.
- Each context has owner/responsibility.
- Events crossing contexts are named.
- Initial service split is justified.
- No context depends on provider SDKs directly.
- Aggregate ownership classification exists for global, tenant-owned and workspace-owned data.
- MVP aggregate cutline is explicit.
- Each aggregate has at least one invariant that can be unit-tested or use-case-tested.
- Cross-context interactions avoid direct infrastructure imports and hidden synchronous coupling.
