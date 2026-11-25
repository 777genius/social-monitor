# 142. Environment Promotion Strategy

## Status

Locked for delivery baseline.

## Research Anchors

- GitHub reusable workflows: https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows
- Google Cloud Well-Architected Framework: https://docs.cloud.google.com/architecture/framework

## Decision

Use explicit environments with promotion gates. Production changes must be traceable to immutable artifacts and reviewed configuration.

## Environments

| Environment | Purpose |
|---|---|
| local | fast developer feedback with fake adapters |
| dev | shared integration, cheap data |
| staging | production-like validation with safe credentials |
| production | real users/data |
| sandbox/demo | app review, sales/demo, limited data |

## Promotion Rules

- Build once, promote same image digest.
- Config differs by environment, code artifact does not.
- Migrations are applied as controlled release steps.
- Staging smoke tests must pass before production.
- Production deploy requires approval until SLO history supports automation.
- Rollback plan exists before deploy.

## Drift Controls

- Detect manual cloud/Kubernetes changes.
- Record config changes in audit/release notes.
- Reconcile runtime config from source of truth.
- Do not hotfix production by hand unless incident runbook allows it.

## Best-Fact Choice

Promotion is a supply-chain and reliability control. Rebuilding different artifacts per environment weakens confidence because staging no longer proves production bits.

