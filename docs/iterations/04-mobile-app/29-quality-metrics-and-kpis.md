# Iteration 04 - Quality Metrics And KPIs

## Primary Quality Signals

| Metric | Target |
| --- | --- |
| Core features with loading/empty/error/stale states | 100% |
| Generated DTO leakage into domain | 0 occurrences |
| MobX stores testable without widgets | 100% for core stores |
| Full MVP mobile flow success | 100% in smoke test |
| Source/summary failure states understandable | Reviewed by product/support |

## Failure Signals

- UI screen needs developer explanation.
- Feature imports another feature infrastructure directly.
- Summary failure hides healthy feed.

## Review KPI

Mobile is healthy when the user completes the core loop and can understand operational failures.
