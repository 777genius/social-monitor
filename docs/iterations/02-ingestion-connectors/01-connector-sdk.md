# Iteration 02 / Phase 01 - Connector SDK

## Objective

Create source provider SDK boundaries before implementing HN/RSS.

## Steps

1. Define `SourceProviderPort`.
2. Define capability profile: search, listing, comments, media, cursor, quota.
3. Define provider-neutral query model.
4. Define provider error taxonomy.
5. Define scan result shape: items, cursor, quota, warnings.
6. Add connector certification test suite.
7. Define `SourceReadinessProfile` for future sources: Reddit, X/Twitter, Telegram, GitHub, YouTube and others.
8. Define provider capability versioning so UI and scheduler can adapt without source-specific branching.

## SourceProviderPort Shape

The exact TypeScript names may change, but the port must preserve this behavior:

```text
SourceProviderPort
  key(): ProviderKey
  capabilityProfile(): SourceCapabilityProfile
  validateBinding(config, credentialState): ValidationResult
  planScan(query, cursor, policy, context): ScanPlan
  scan(plan, context): ScanResult
  classifyError(error, context): ProviderFailure
```

Required DTO boundaries:

1. `SourceQuery` is provider-neutral and cannot contain raw provider request objects.
2. `ScanContext` carries tenant id, workspace id, topic id, source binding id, correlation id, attempt number and time budget.
3. `ScanPlan` captures request intent, max items, backfill window and safe retry hints.
4. `ScanResult` contains normalized items, next cursor candidate, warnings, quota hints and provider failure when partial.
5. `ProviderCursor` is opaque to use cases but versioned and typed by provider/capability version.
6. Raw provider payloads can be stored only through an explicit raw-payload port with retention policy.

## SourceReadinessProfile States

| State | Meaning | Allowed Action |
| --- | --- | --- |
| `research_only` | source is being evaluated | write notes, no adapter work |
| `profiled` | capability/limits/risks are documented | plan fixtures and ADR |
| `certification_ready` | fixtures and allowed access path exist | implement adapter behind feature flag |
| `enabled_beta` | adapter passed certification and policy review | enable for controlled tenants |
| `provider_only` | direct adapter is not safe/practical | evaluate paid/vendor integration |
| `manual_only` | automated monitoring is not appropriate | allow import/export/manual capture if useful |
| `rejected` | access, safety, cost or reliability fails | no product path until decision changes |

Readiness fields:

- acquisition mode
- approval owner
- terms/policy notes
- credential ownership
- quota model
- retention/deletion constraints
- cursor and identity strategy
- supported content units
- unsupported content units
- estimated cost per scan/item
- beta enablement criteria
- rollback/disable plan

## Capability Profile Fields

Each provider profile must include:

- Provider key and display name.
- Acquisition mode and approval status.
- Supported content units: posts, comments/replies, profiles, communities, media, links.
- Supported query modes: search, listing/feed, account feed, thread hydration, URL ingestion, backfill.
- Cursor model: none, time cursor, page token, opaque cursor, since id, ETag/Last-Modified.
- Stable identity strategy: provider id, canonical URL, content hash, composite key.
- Quota model: per app, per credential, per tenant, per source binding, paid provider unit.
- Credential requirements: none, app key, tenant OAuth, tenant API key, provider contract.
- Failure taxonomy mapping.
- Data retention and deletion constraints.
- User-visible limitations and fallback behavior.

## Certification Test Requirements

The shared suite must fail an adapter when:

1. `capabilityProfile()` omits cursor, quota, identity or limitation fields.
2. `validateBinding()` accepts unsupported query modes.
3. `scan()` returns provider DTOs instead of normalized items.
4. repeated scans duplicate items without stable identity reason.
5. cursor advances before durable persistence can be proven by the worker contract.
6. provider errors are thrown raw instead of classified.
7. timeout/rate-limit behavior has no retryability classification.
8. tenant/workspace/source binding context is missing from scan logs/events.
9. raw payload retention is enabled without documented retention policy.
10. source limitation cannot be represented in user-visible source health.

Minimum fixture categories:

- happy path
- empty result
- duplicate result
- deleted/unavailable item
- edited item
- malformed payload
- pagination/cursor expiration
- rate limit
- partial provider outage
- auth/credential failure when applicable

## Edge Cases

- Provider supports posts but not search.
- Cursor expires or becomes invalid.
- Provider returns duplicate items.
- Provider has partial outage.
- Provider supports search only on paid tier.
- Provider supports comments but not reliable thread hydration.
- Provider identity changes when content is edited or deleted.
- Provider cursor is valid only for a short time window.
- Provider returns the same item through search and listing endpoints.
- Provider returns a successful response with missing required fields.
- Provider policy permits personal use but not multi-tenant SaaS use.
- Provider changes available fields by account tier.

## Pay Attention

- Capability unavailable is not a generic failure.
- Provider DTOs do not leak into domain.
- All provider calls need timeout/retry/budget rules.
- A provider adapter is an anti-corruption layer, not a second domain model.
- Capability profiles are versioned contracts for scheduler, UI and source health.
- If a source cannot be certified, keep it in readiness profile and do not build around it.

## Acceptance Criteria

- HN and RSS can implement same port.
- Fake connector passes certification suite.
- Provider error mapping is tested.
- Capability matrix is persisted/configurable.
- Future Reddit/X/Telegram/GitHub source requests can be evaluated without changing core ingestion domain.
- Source readiness states and certification requirements are documented and testable.
- Adapter implementation cannot start until fixtures and certification expectations are known.
