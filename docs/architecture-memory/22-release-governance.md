# Release Governance & Error Budgets

Date: 2026-05-31
Status: baseline release governance memory

## Decision

Release governance must be risk-based. Connector, prompt/model and billing changes are high-risk by default.

Reference:

- Google SRE Error Budget Policy: https://sre.google/workbook/error-budget-policy/

## Risk Classes

Low:

- UI copy;
- non-contract internal refactor;
- docs-only changes.

Medium:

- new REST endpoint;
- new summary rule option;
- connector bug fix;
- new dashboard/admin read view.

High:

- connector version change;
- event schema change;
- database migration on large table;
- summarization prompt/model change;
- billing/cost logic change;
- provider routing policy change.

Critical:

- auth;
- tenant isolation;
- compliance deletion;
- credential handling;
- encryption/secrets;
- tenant data export/delete.

## Required Gates

High/Critical changes require:

- ADR or migration note;
- rollout flag;
- rollback plan;
- staging verification;
- metrics to watch;
- owner for rollout;
- post-release check.

## Error Budget Policy

If a component burns too much error budget:

- freeze risky feature releases for that component;
- prioritize reliability work;
- require owner review before rollout;
- require rollback plan for changes.

## Progressive Delivery

Connector rollouts:

```text
internal tenant
-> 1% low-risk scans
-> selected beta tenants
-> general availability
```

Prompt/model rollouts:

```text
offline eval pass
-> internal tenant
-> shadow/dual run where possible
-> small cohort
-> full rollout
```

## Locked Decisions

1. Release governance is risk-based.
2. Connector/model/billing changes are high-risk by default.
3. Error budget can freeze risky releases.
4. Rollout flags and rollback paths are required for high-risk changes.
5. No high-risk rollout without owner and post-release check.

