# Production Launch Checklist

Date: 2026-05-31
Status: baseline production launch memory

## Decision

Do not launch production SaaS until minimum reliability, security, compliance and cost controls exist.

## Required Before Production

Contracts:

- OpenAPI generated and checked;
- event schemas versioned;
- protobuf checks if gRPC used;
- error format standardized.

Data:

- Postgres migrations tested;
- PITR configured;
- restore drill completed;
- raw payload lifecycle configured;
- tenant_id on product-owned rows.

Ingestion:

- HN/RSS connector certified;
- connector run state machine implemented;
- rate limits and cursors persisted;
- idempotency keys implemented;
- DLQ/retry policies implemented.

AI:

- summary rule versioning;
- model/prompt versioning;
- cost ledger;
- schema validation;
- eval gate for prompt/model changes.

Security:

- OIDC/auth configured;
- secrets manager configured;
- secret scanning enabled;
- connector credentials encrypted;
- audit log for high-risk actions;
- SSRF controls for user URLs.

Ops:

- dashboards;
- P0/P1 runbooks;
- kill switches;
- backup alerts;
- queue lag alerts;
- cost runaway alert.

Compliance:

- source policy matrix for enabled sources;
- deletion/tombstone workflow;
- raw payload purge job;
- export/delete request path.

Frontend:

- generated client build;
- DTO mapping;
- source reauth UX;
- actionable error states;
- accessibility baseline.

## Explicit Non-Goals For First Launch

Not required before first controlled production:

- full multi-region deployment;
- Temporal;
- OpenSearch;
- dedicated vector DB;
- DataHub/OpenMetadata;
- EventCatalog;
- complex enterprise SCIM;
- X realtime promise.

## Locked Decisions

1. Launch requires minimum controls, not every future platform tool.
2. HN/RSS can launch before X.
3. X is not launch blocker.
4. PITR/restore drill is launch blocker.
5. Cost ledger and kill switches are launch blockers.

