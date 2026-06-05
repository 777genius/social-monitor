# Iteration 00 - Foundation Overview

## Goal

Freeze the product, domain and architecture decisions before code generation starts.

This iteration prevents the MVP from becoming a collection of scrapers, prompts and screens. The product must be defined as a multi-tenant social intelligence platform with replaceable source acquisition.

## Bounded Contexts

- `IdentityAccess` - users, tenants, memberships, roles, auth sessions.
- `TopicMonitoring` - topics, source bindings, scan policies, query DSL.
- `SourceIngestion` - provider capabilities, scan jobs, cursors, normalized items.
- `FeedIntelligence` - dedupe, clustering, relevance scoring, summaries.
- `Delivery` - realtime status, digests, notifications, webhooks.
- `BillingUsage` - quotas, usage ledger, source/AI cost controls.
- `AdminGovernance` - source registry, provider risk, support-safe tooling.

## Non-Negotiable Architecture Rules

1. Domain entities do not import NestJS, Prisma, HTTP clients, Kafka clients or provider DTOs.
2. Use cases depend on ports, not adapters.
3. Every external source is represented by a capability profile.
4. Every provider result stores provenance and source limitations.
5. Every async workflow is idempotent and replay-safe.
6. Every multi-tenant query is tenant-scoped by construction.
7. Summary output is structured, cited and versioned.
8. Frontend features are feature-scoped Clean Architecture slices with MobX stores.

## Phase Map

1. `01-product-domain-scope.md` - product scope, MVP personas and what is explicitly not in MVP.
2. `02-bounded-context-map.md` - DDD context map and upstream/downstream relationships.
3. `03-architecture-standards.md` - coding standards, clean boundaries, dependency rules.
4. `04-contract-first-planning.md` - OpenAPI, event contracts, source contracts and Flutter client generation.

## Detailed Steps

1. Write the product definition as a domain statement, not a feature list.
2. Define MVP users: solo founder/researcher first, team/enterprise later.
3. Define source priority: HN, RSS/open web, Reddit path, GitHub, YouTube basic.
4. Define deferred sources: X/Twitter paid/vendor, Meta, LinkedIn, TikTok, regional platforms.
5. Define source risk outcomes: `mvp_approved`, `vendor_adapter_only`, `owned_account_only`, `rejected_not_production_safe`.
6. Define all aggregate roots and invariants.
7. Define all domain events and commands in plain language first.
8. Define canonical API resource names.
9. Define event naming policy and CloudEvents-inspired envelope.
10. Define frontend feature names matching backend bounded contexts.
11. Define data retention and deletion principles.
12. Define the minimum launchable MVP workflow end to end.

## Edge Cases

- User subscribes to a topic with no supported sources.
- Source is allowed for one tenant but blocked for another.
- Topic query is syntactically valid but too expensive.
- User asks for a source that has no safe acquisition path.
- Summary rules conflict with source limitations.
- A provider changes API limits after the contract is written.
- Multi-region/legal constraints appear before enterprise launch.

## Questions To Clarify

- Is the first buyer an indie/SaaS founder, researcher, agency, or internal analyst?
- Is Reddit required in first private beta, or can HN/RSS/GitHub launch first?
- Should AI summaries be per topic, per digest, or both?
- Is mobile app mandatory for first test users, or can backend/API/admin launch first?
- Which alert channel is first: email, Telegram, Slack, push, or in-app only?

## Quality Gates

- Bounded contexts are documented and each has owner modules.
- Every MVP source has a source option document or explicit defer reason.
- OpenAPI/event contract naming rules exist before controllers are written.
- Frontend architecture style is fixed before screens are implemented.
- No feature is accepted without tenant, source and quota implications.

## Done Criteria

Iteration 00 is complete only when the team can explain:

```text
who uses it -> what topics they monitor -> what sources are allowed
-> how scans run -> how items normalize -> how summaries are generated
-> how alerts/status reach the user
```

