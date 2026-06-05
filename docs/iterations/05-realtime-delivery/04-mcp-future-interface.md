# Iteration 05 / Phase 04 - MCP/Future Interface

## Objective

Prepare future external intelligence interface without overbuilding.

## Steps

1. Define future MCP/API use cases: query summaries, recent signals, source health.
2. Keep current public API contract compatible.
3. Add read-only integration DTOs.
4. Define security model: API key scopes and tenant boundaries.
5. Document non-goals for MVP.

## Edge Cases

- External tool requests raw provider payload.
- Prompt injection through external query.
- API key has too broad scope.
- Export violates tenant retention.

## Pay Attention

- MCP is future interface, not MVP blocker.
- Do not expose internal domain/event schemas directly.
- External access needs rate and audit controls.

## Acceptance Criteria

- Future MCP requirements documented.
- Current API has extension path.
- No MVP schedule dependency on MCP.
