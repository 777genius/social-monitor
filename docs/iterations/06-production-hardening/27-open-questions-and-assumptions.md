# Iteration 06 - Open Questions And Assumptions

## Working Assumptions

1. Tenant isolation is a hard beta gate.
2. Support must diagnose common failures without shell access.
3. Cost/quota controls are required before beta.
4. CI must block breaking OpenAPI and migration changes.

## Open Questions

| Question | Owner | Deadline | Decision Impact |
| --- | --- | --- | --- |
| What are beta quota limits per tenant/topic/source? | Product/ops | Before beta | Cost/fairness |
| Which dashboards are mandatory for support? | SRE/support | Before launch review | Support readiness |
| What backup/restore RPO/RTO is acceptable for beta? | SRE/product | Before launch | Recovery plan |
| Which alert thresholds avoid noise but catch outages? | SRE | Before on-call | Alerting |

## Validation Rule

Do not launch beta until tenant isolation, secret redaction and support dashboards are verified.
