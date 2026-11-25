# Iteration 03 - Change Control

## Change Types

| Change | Requires Review | Required Evidence |
| --- | --- | --- |
| Summary policy change | Domain/product owner | Rule validation impact |
| Prompt template change | AI owner | Eval run |
| AI provider/model change | AI/ops owner | Cost, latency and quality comparison |
| Output schema change | API/mobile owners | Compatibility impact |
| Citation model change | Feed/summary owners | Evidence traceability impact |

## Approval Rules

1. Do not ship prompt changes without eval output.
2. Do not change output schema without mobile/API review.
3. Do not allow uncited final summaries.
4. Do not change model/provider without cost telemetry check.
5. Do not change eval thresholds without recording what risk is accepted.

## Rollback

- Revert prompt templates by version.
- Revert provider selection by environment config.
- Hide invalid summary output and keep feed visible.

## Audit Notes

Record model, prompt, eval score, cost impact and affected summary policies.

## Lightweight MVP Rule

Prompt copy tweaks can be change notes only if evals pass and schema/citation behavior is unchanged. Provider/model/schema/policy changes require ADR.
