# Iteration 03 - Definition Of Done

## Done Checklist

1. Summary policy aggregate exists.
2. Summary rule validation exists.
3. Evidence model exists.
4. AI provider port exists.
5. Provider adapter is replaceable.
6. Structured output validation exists.
7. Summary job lifecycle exists.
8. Citations persist.
9. Cost/token telemetry persists.
10. Eval harness exists.
11. Summary REST endpoints exist.
12. Feedback endpoint exists.

## Architecture Done

- Prompts do not own domain invariants.
- AI provider payloads do not leak into domain.
- Summary output references normalized feed items.
- Summary jobs are idempotent and tenant-scoped.

## Evidence Required

- Policy validation tests.
- Structured output validation tests.
- Citation coverage sample.
- Eval run output.
- Cost telemetry sample.

## Not Done If

- Summary can be shown without citations.
- Provider output is trusted without schema validation.
- Cost is invisible.
- Prompt change has no regression check.
