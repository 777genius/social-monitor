# Iteration 00 / Phase 04 - Contract-First Planning

## Objective

Define external and internal contracts before implementation.

## Steps

1. Draft OpenAPI resources: topics, source bindings, scan policies, feed, summaries, source health, auth/session.
2. Draft WebSocket events: scan status, source health, summary ready, summary failed.
3. Draft async event catalog: source item normalized, summary requested, summary completed.
4. Draft gRPC candidates but defer unless service split requires it.
5. Define API versioning and generated Flutter client strategy.
6. Define contract test plan: OpenAPI lint, Schemathesis, Pact for critical client flows.
7. Define Problem Details error shape and stable error codes.
8. Define compatibility policy for enums, statuses and optional fields.
9. Define event envelope fields shared by Kafka, RabbitMQ jobs and WebSocket events where applicable.

## API Error Contract

Use Problem Details for REST errors. Each user-relevant error must include:

- `type`: stable documentation URI or stable internal type string.
- `title`: short class of failure.
- `status`: HTTP status.
- `code`: stable machine-readable code.
- `detail`: safe user/support-oriented message.
- `correlationId`: traceable request id.
- `tenantId` or `workspaceId` only when safe and required for support context.
- `recoveryAction`: retry, edit_config, reconnect_source, reduce_interval, wait, contact_support or none.

Do not expose provider credentials, raw provider payloads, prompts, stack traces or internal SQL/broker details.

## MVP REST Contract Baseline

Define these endpoints before implementation. Keep the first version small, stable and generated into the Flutter client.

| Resource | Endpoint | Purpose | MVP Notes |
| --- | --- | --- | --- |
| Workspaces | `GET /v1/workspaces` | list user workspaces | tenant-aware, no cross-tenant hints |
| Workspaces | `POST /v1/workspaces` | create workspace | idempotency key required |
| Topics | `GET /v1/workspaces/{workspaceId}/topics` | list topics | supports status/filter pagination |
| Topics | `POST /v1/workspaces/{workspaceId}/topics` | create topic | validates summary/scan rule references |
| Topics | `PATCH /v1/workspaces/{workspaceId}/topics/{topicId}` | update/disable topic | disabling stops new scans, does not hide history |
| Sources | `GET /v1/source-catalog` | list supported source profiles | returns capability summary and readiness status |
| Source Bindings | `POST /v1/workspaces/{workspaceId}/topics/{topicId}/source-bindings` | bind source to topic | requires capability profile and credential state when needed |
| Source Bindings | `PATCH /v1/workspaces/{workspaceId}/source-bindings/{bindingId}` | enable/disable/update binding | changing source config may reset cursor only by explicit policy |
| Scan Policies | `PUT /v1/workspaces/{workspaceId}/source-bindings/{bindingId}/scan-policy` | set interval/freshness | validates quota and source limits |
| Scan Jobs | `POST /v1/workspaces/{workspaceId}/source-bindings/{bindingId}/scan-runs` | request manual scan | rate limited, idempotent |
| Feed | `GET /v1/workspaces/{workspaceId}/topics/{topicId}/feed` | read deduplicated items | cursor pagination, provenance included |
| Summaries | `POST /v1/workspaces/{workspaceId}/topics/{topicId}/summaries` | request summary | validates evidence window and summary rules |
| Summaries | `GET /v1/workspaces/{workspaceId}/topics/{topicId}/summaries` | list summaries | includes citation status and quality state |
| Feedback | `POST /v1/workspaces/{workspaceId}/summaries/{summaryId}/feedback` | record feedback | no prompt/raw provider leakage |
| Status | `GET /v1/workspaces/{workspaceId}/operations/{operationId}` | read scan/summary operation state | REST source of truth for WS resync |

Contract rules:

1. All write endpoints require `Idempotency-Key`, tenant/workspace authorization and correlation id.
2. Lists use cursor pagination, not offset-only pagination, because feed and scan data changes while users read.
3. API DTOs expose normalized source/feed/summary vocabulary, not provider DTOs.
4. Every response that references external data includes provenance or a support-safe health/status reason.
5. Unknown enum values must be representable by mobile as `unknown` with raw value preserved in infrastructure only.
6. Manual scan endpoint is a beta support tool, not the primary scheduler path.

## MVP Event Catalog Baseline

| Event | Producer | Consumers | Why It Exists |
| --- | --- | --- | --- |
| `workspace.created.v1` | Identity/Tenancy | audit, support | tenant boundary created |
| `topic.created.v1` | Topic Management | scheduling, realtime | start source binding and scan policy setup |
| `topic.disabled.v1` | Topic Management | scheduling, delivery, realtime | stop new work and update UI status |
| `source_binding.enabled.v1` | Source Management | scheduling, realtime | allow scheduled scans |
| `source_binding.disabled.v1` | Source Management | scheduling, delivery, realtime | stop scans/delivery for source |
| `scan.requested.v1` | Scheduling/API | ingestion worker, realtime | enqueue scan run |
| `scan.completed.v1` | Ingestion | feed, summary, realtime, usage | source run produced outcome |
| `source_item.observed.v1` | Ingestion | feed, usage | normalized source item available |
| `feed_item.deduplicated.v1` | Feed | summary, realtime | user-visible item available |
| `summary.requested.v1` | Summary/API | intelligence worker, realtime, usage | summary work accepted |
| `summary.completed.v1` | Intelligence | delivery, realtime, usage | cited artifact ready |
| `delivery.attempted.v1` | Delivery | support, usage | delivery outcome visible |

Each event envelope includes:

- `eventId`
- `eventType`
- `eventVersion`
- `occurredAt`
- `tenantId`
- `workspaceId` when applicable
- `correlationId`
- `causationId`
- `idempotencyKey`
- `producer`
- `schemaVersion`

## Contract Test Minimum

1. OpenAPI lint validates naming, versioning, auth, Problem Details and cursor pagination.
2. Generated Flutter client is regenerated in CI and compared for deterministic output.
3. API contract tests cover create topic, bind source, request scan, read feed, request summary and submit feedback.
4. Event schema tests cover envelope fields, version compatibility and unknown optional fields.
5. Mobile mapper tests prove unknown enum/status fallback.
6. Negative tests prove authorization errors do not reveal other tenants' resource existence.

## Compatibility Rules

- Adding optional response fields is allowed.
- Removing or renaming fields is breaking.
- New enum/status values are allowed only if clients have unknown-value fallback.
- Changing error `code` semantics is breaking.
- WebSocket events may add optional fields, but must not change existing meaning.
- Event envelope version increments when consumers need new parsing behavior.
- Generated mobile clients must be regenerated and mapper tests updated for API changes.

## Contract Compatibility Matrix

Use this matrix for every contract-changing ticket before implementation.

| Contract | Usually Safe In MVP | Breaking Or Gate-Blocking | Required Evidence |
| --- | --- | --- | --- |
| REST/OpenAPI | add optional response field, add new endpoint, add nullable field with default mapper behavior | remove/rename field, change required field, change path meaning, change error code semantics | OpenAPI diff, generated Flutter client, mapper tests |
| Problem Details | add new code with recovery mapping, add safe optional diagnostic field | reuse existing code for different meaning, expose raw provider/internal detail | API error fixture and mobile recovery mapping |
| Async events | add optional payload field, add new event type with no required consumer | change envelope, remove field, change event meaning, skip idempotency/tenant fields | schema test, replay fixture, consumer compatibility test |
| WebSocket events | add optional hint field, add new status with fallback | make WS required for correctness, change reconnect/replay semantics without REST resync | missed-event/resync test |
| Database schema | additive nullable column, additive index, versioned metadata shape | destructive rename/drop, constraint before backfill, incompatible worker schema | clean/upgrade migration test, rollback/compat plan |
| Generated Flutter client | deterministic regeneration with mapper updates | raw DTO reaches domain/store, unknown enum has no fallback | generated diff, mapper/store tests |
| Provider capability profile | add capability flag, add stricter limit, version profile | silently change cursor/rate-limit semantics for existing binding | binding snapshot migration/re-check fixture |
| AI summary schema | add optional quality field, add stricter validation with UI support | remove citation field, change claim/citation semantics, bypass eval | schema validation, eval rerun, mobile summary mapper test |

Compatibility rules:

1. Every breaking change needs owner, consumer impact, migration path, rollback/mitigation and gate evidence.
2. Additive changes still need generated-client and mapper evidence if mobile sees them.
3. New enum/status/error values are not safe unless every consumer has fallback behavior.
4. Event changes must define replay behavior before beta-facing consumers depend on them.
5. DB migrations must stay compatible with workers that may be running old code during deploy.
6. Provider capability changes apply to new bindings immediately; existing bindings use snapshot semantics until migration or explicit pause.
7. AI schema changes require eval rerun if they affect final user-visible summaries.

## Edge Cases

- Mobile client lags server version.
- WebSocket event missed during reconnect.
- API enum gets new value.
- Source-specific error must map to generic source health.
- Problem Details code exists but has no mobile recovery action.
- Provider-specific status leaks into public API and becomes hard to change.
- Event consumer receives newer envelope version.
- Idempotent command is retried with same key and different payload.
- Feed list changes while mobile is paging.
- Source binding config change invalidates old cursor assumptions.
- Summary request references feed items that are now hidden or unavailable.
- Migration deploys while workers still write old shape.
- Event replay sends an older schema version to a newer consumer.
- New Problem Details code has no mobile recovery action.
- Provider capability profile gets stricter and existing scheduled scans keep running.
- AI schema adds a field that mobile treats as required and crashes on older summaries.

## Pay Attention

- REST is source of truth; WebSocket is freshness signal.
- Generated code is infrastructure and must be wrapped.
- Unknown enum/event handling is mandatory.
- Keep v1 endpoints boring and stable; source-specific richness belongs in capability/profile fields.
- Contract drift should fail before runtime tests, not after mobile discovers it.
- Compatibility is a release gate, not a documentation preference.
- If a contract change cannot name its consumers, it is not ready for implementation.

## Acceptance Criteria

- OpenAPI draft exists.
- WS envelope exists.
- Event catalog v1 exists.
- Contract compatibility rules are documented.
- Problem Details shape and stable error-code taxonomy exist.
- Mobile unknown enum/status fallback is required by contract.
- MVP REST baseline endpoints are listed with idempotency and tenant-scope requirements.
- MVP event catalog has producers, consumers and reason for each event.
- Contract test minimum is explicit enough to implement CI.
- Contract compatibility matrix is used by tickets that touch API, events, DB, generated clients, provider capability or AI schema.
