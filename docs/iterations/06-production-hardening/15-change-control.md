# Iteration 06 - Change Control

## Change Types

| Change | Requires Review | Required Evidence |
| --- | --- | --- |
| Security policy change | Security owner | Threat/tenant impact |
| Quota change | Product/ops owners | Cost and fairness impact |
| Alert threshold change | SRE owner | Noise/miss analysis |
| CI gate change | Platform owner | Risk of unsafe merge |
| Migration/deploy change | Release owner | Rollback plan |

## Approval Rules

1. Do not weaken tenant isolation.
2. Do not remove secret redaction checks.
3. Do not loosen CI contract gates without explicit exception.
4. Do not change quota policy without support messaging.
5. Do not change safe metric label policy without security/ops review.

## Rollback

- Revert alert thresholds if they hide real incidents.
- Restore stricter quotas during cost spike.
- Roll back deploy through documented release path.

## Audit Notes

Record security, quota, CI, alert and migration changes with owner and reason.

## Lightweight MVP Rule

Alert text and dashboard layout changes can be change notes. Tenant isolation, redaction, quota, CI gate, rollback and metric-label policy changes require ADR or formal exception.
