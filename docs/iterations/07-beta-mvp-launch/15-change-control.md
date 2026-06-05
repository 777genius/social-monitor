# Iteration 07 - Change Control

## Change Types

| Change | Requires Review | Required Evidence |
| --- | --- | --- |
| Beta scope change | Product/release owners | Launch impact |
| Supported source change | Source/platform owners | Capability profile and risk class |
| Onboarding change | Product/support owners | User completion impact |
| Known limitation change | Product/support owners | User expectation impact |
| Feedback taxonomy change | Product owner | Roadmap impact |

## Approval Rules

1. Do not add unsupported sources to beta scope.
2. Do not hide known limitations that affect the MVP loop.
3. Do not change launch checklist after approval without release review.
4. Do not treat anecdotal source demand as roadmap proof without metrics.
5. Do not promote post-beta work without feedback, reliability and production-safe access evidence.

## Rollback

- Roll beta cohort back to supported source set.
- Revert onboarding changes if activation drops.
- Pause launch if support cannot diagnose failures.

## Audit Notes

Record scope changes, launch decision changes, source requests and feedback taxonomy updates.

## Lightweight MVP Rule

Support-copy clarifications can be change notes. Supported sources, beta scope, launch gates, rollback criteria and roadmap-priority changes require ADR/change-control entry.
