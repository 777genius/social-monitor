# Iteration 03 - Phase Step Matrix

## Phase 01 - Summary Domain Contract

### Build Steps

1. Define summary request command.
2. Define summary artifact schema.
3. Define citations.
4. Define confidence fields.
5. Define no-signal summary.
6. Define summary rule set.
7. Define summary states.
8. Define stale summary criteria.

### Dependencies

- Feed read model.
- Source item provenance.

### Edge Cases

- No relevant items.
- Conflicting source items.
- Deleted cited item.

### Validation

- Schema validates all fixture cases.

## Phase 02 - AI Provider Adapter

### Build Steps

1. Define AI provider port.
2. Implement fake provider.
3. Implement real provider adapter.
4. Add prompt registry.
5. Add model routing.
6. Add cost estimate.
7. Add structured output validation.
8. Add retry/fallback.
9. Add redaction hook.

### Dependencies

- Summary schema.
- AI data boundary policy.

### Edge Cases

- Provider returns invalid JSON.
- Provider refuses content.
- Provider times out.
- Cost estimate exceeds quota.

### Validation

- Invalid output cannot persist as completed.
- Provider errors map to user-visible status.

## Phase 03 - Evals And Quality

### Build Steps

1. Create evaluation fixtures.
2. Add citation coverage checks.
3. Add hallucination heuristics.
4. Add summary usefulness rubric.
5. Add prompt regression snapshots.
6. Add noisy-topic tests.
7. Add multilingual tests.
8. Add cost regression.

### Dependencies

- Summary provider.

### Edge Cases

- Summary overstates weak signal.
- Summary misses minority critical item.
- Prompt change improves tone but harms factuality.

### Validation

- Prompt changes require eval run.

## Phase 04 - Summary UX Readiness

### Build Steps

1. Add summary list API.
2. Add summary detail API.
3. Add regenerate API.
4. Add rule editing API.
5. Add status endpoint.
6. Add citation expansion.
7. Add stale summary indicator.

### Dependencies

- Mobile API contracts.

### Edge Cases

- Regenerate spam.
- Rule changes during generation.
- Citation unavailable.

### Validation

- Flutter can display all summary states without extra backend changes.

