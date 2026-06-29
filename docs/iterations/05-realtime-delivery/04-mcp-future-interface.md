# Iteration 05 / Phase 04 - MCP/Future Interface

## Objective

Prepare future external intelligence interface without overbuilding.

Status: `Documented / implementation deferred`.

This phase is intentionally a contract and security preparation phase. It must not add an MCP server, agent runtime or new public mutation surface during the backend/API-first MVP unless a beta user explicitly needs it.

## Steps

1. Define future MCP/API use cases: query summaries, recent signals, source health.
2. Keep current public API contract compatible.
3. Add read-only integration DTOs.
4. Define security model: API key scopes and tenant boundaries.
5. Document non-goals for MVP.

## Future Read-Only Use Cases

Allowed future machine-interface queries:

1. `summaries.search`
   - Tenant/workspace scoped.
   - Returns summary IDs, topic IDs, status, safe title/excerpt, citation/resource links.
   - Does not return prompts, raw source payloads, provider credentials or hidden scoring internals.
2. `signals.recent`
   - Tenant/workspace scoped.
   - Returns feed item IDs, source type, normalized title/excerpt, observed timestamp, signal level and REST resource links.
   - Does not expose raw scraped HTML/API responses or private provider request metadata.
3. `source_health.read`
   - Tenant/workspace scoped.
   - Returns source binding health, last scan status, next scheduled scan and support-safe failure reason.
   - Does not expose OAuth tokens, cookies, proxy metadata or anti-abuse details.
4. `delivery_status.read`
   - Tenant/workspace scoped.
   - Returns digest/webhook/delivery attempt status and failure class.
   - Does not expose webhook signing secrets or full outbound payload bodies.

## Scope Model

Reuse the existing API-key scope model and extend only when implementation begins:

- Existing read scopes: `read:interests`, `read:feed`, `read:summaries`, `read:delivery_status`, `read:webhook_endpoints`.
- Existing mutation scopes: `write:interests`, `write:source_bindings`, `write:scan_requests`, `write:summaries`, `write:webhook_endpoints`.
- Future MCP tools must map to the narrowest read scope possible.
- A future write-capable tool must not reuse read scopes.
- Tenant/workspace from the API key remains authoritative; client-provided tenant/workspace identifiers are only selectors inside that boundary.

## DTO Shape Rules

Future machine-interface DTOs must follow these rules:

1. Include `tenantId`, `workspaceId`, stable resource IDs and REST resource links.
2. Include version fields for DTOs that may be cached or consumed by external tools.
3. Include support-safe status/failure values, not provider-specific raw errors.
4. Include citation/provenance links for summaries and feed signals.
5. Treat unknown enum values as possible; clients must have fallback handling.
6. Keep DTOs read-optimized and separate from internal domain entities/events.

## Rate And Audit Controls

The current implementation already provides reusable building blocks:

- `CheckPublicApiRateLimitUseCase` in Usage for per-subject/per-operation limits.
- `RecordPublicApiAuditEventUseCase` in Usage for support-safe audit records.

Future MCP/read-only handlers must call both controls before returning external data:

1. Verify API key and required read scope.
2. Check tenant/workspace match.
3. Apply rate limit by API key ID and operation name.
4. Record audit event with action, resource type, optional resource ID and safe metadata.
5. Never write audit metadata containing raw source text, prompt text, credentials, secrets, cookies or webhook signing secrets.

## Extension Path From Current API

No new backend context is required for MVP. The extension path is:

1. Add read-only feature use cases in the owning bounded context if current REST read model is insufficient.
2. Add DTO mappers in `interfaces`, not in domain/features.
3. Add an MCP/API boundary module that depends on the feature use cases and Usage controls.
4. Keep REST snapshot endpoints as source of truth; machine interface is a convenience facade.
5. Add e2e tests for tenant boundary, narrow scope enforcement, rate limiting and audit event creation.

## Current Evidence

Implemented foundation already available:

- API key scopes and revocation: `3b1dbc4`, `8256489`, `26887ec`.
- Public API rate limiting: `d9eee51`.
- Support-safe public API audit events: `a5bd3fd`.
- Webhook/resource-reference external payload discipline: `56115ff`, `ce80787`.

No MCP server has been implemented in MVP, by design.

## Edge Cases

- External tool requests raw provider payload.
- Prompt injection through external query.
- API key has too broad scope.
- Export violates tenant retention.
- External tool enumerates IDs from another workspace.
- External tool triggers expensive repeated reads or summary regeneration.
- External tool asks for hidden prompt/system instructions.
- External tool asks for webhook secrets or API key hashes.
- External tool treats stale summaries as fresh.

## Pay Attention

- MCP is future interface, not MVP blocker.
- Do not expose internal domain/event schemas directly.
- External access needs rate and audit controls.
- Read-only means no topic/source/scan/summary mutation.
- DTOs should reference resources instead of embedding sensitive content.
- Prompt-injection resistance belongs in the data returned and in future tool descriptions.

## Acceptance Criteria

- Future MCP requirements documented.
- Current API has extension path.
- No MVP schedule dependency on MCP.
- Security model maps to narrow API key scopes.
- Rate limit and audit controls are identified as mandatory for future handlers.
