# Iteration 04 - Change Control

## Change Types

| Change | Requires Review | Required Evidence |
| --- | --- | --- |
| Feature boundary change | Mobile architecture owner | Dependency impact |
| Generated client change | API/mobile owners | OpenAPI diff |
| Store behavior change | Feature owner | Store tests |
| UI state change | Product/support owner | Failure-state coverage |
| Headless component change | UI owner | Accessibility and consistency check |

## Approval Rules

1. Do not use generated DTOs as domain models.
2. Do not move domain invariants into widgets or stores.
3. Do not remove failure states without support review.
4. Do not change navigation for core loop without full-flow smoke.
5. Do not change `flutter_headless` version/commit without wrapper and accessibility evidence.

## Rollback

- Revert client generation if OpenAPI break is accidental.
- Hide incomplete feature screens behind feature flag.
- Restore previous store behavior if state regression appears.

## Audit Notes

Record OpenAPI version, feature affected, store changes and failure-state impact.

## Lightweight MVP Rule

Visual tweaks can be change notes. Feature boundary changes, generated-client strategy, store contract changes and core navigation changes require ADR or explicit architecture review note.
