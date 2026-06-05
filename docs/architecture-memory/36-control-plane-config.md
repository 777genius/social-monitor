# Control Plane & Runtime Configuration

Date: 2026-05-31
Status: baseline control plane memory

## Decision

Runtime behavior must be controlled by versioned configuration and feature flags, not code redeploys.

Use OpenFeature-style abstractions for feature flag evaluation. Start simple; keep provider replaceable.

References:

- OpenFeature provider concept: https://openfeature.dev/docs/reference/concepts/provider
- OpenFeature evaluation context: https://openfeature.dev/docs/reference/concepts/evaluation-context

## Control Plane Owns

```text
source enable/disable
provider priority
scan frequency bounds
tenant budgets
connector version rollout
summary model policy
prompt template version
backfill limits
emergency kill switches
experiment assignments
```

## Required Properties

Every risky config must have:

- version;
- owner;
- audit log;
- rollout targeting;
- rollback path;
- effective_at;
- expires_at where useful;
- dry-run/preview where possible.

## Evaluation Context

```text
tenant_id
plan
region
source_type
provider
risk_level
internal_user
budget_remaining
connector_version
model_policy
```

Do not put secrets, raw source content or PII-heavy fields into feature flag evaluation context.

## Kill Switches

Required:

```text
disable_source
disable_provider
disable_connector_version
pause_backfills
pause_summaries
pause_tenant_expensive_ops
force_compliance_priority
disable_webhook_endpoint
```

## Locked Decisions

1. Runtime source/provider/model behavior belongs in control plane.
2. Risky config changes are audited and versioned.
3. Feature flag context must avoid secrets/raw content.
4. Kill switches are production requirements.
5. Control plane starts simple but uses provider abstraction.

