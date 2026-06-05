# Tool Permission Registry

Date: 2026-05-31
Status: baseline tool permission memory

## Decision

Any future AI/tool automation must use a tool permission registry.

Tools are classified by risk and allowed execution context.

## Tool Risk Classes

Read-only:

```text
read feed items
read summaries
read source health
read cost summary
```

Low-impact write:

```text
draft topic rule
draft summary rule
save user preference draft
```

High-impact write:

```text
trigger scan
start backfill
send digest
send webhook
change budget
enable provider fallback
delete source binding
```

Forbidden for AI direct execution:

```text
rotate credentials
delete tenant data
purge raw payloads
grant admin access
disable compliance workflow
read secrets
```

## Registry Fields

```text
tool_name
risk_class
allowed_callers
requires_policy_check
requires_human_approval
max_cost
max_rows
tenant_scope_required
audit_required
enabled
```

## Execution Rule

AI can request a tool action. Policy engine decides whether it can run. High-impact tools require approval.

## Locked Decisions

1. Future tool automation uses registry.
2. Tool risk class determines approval/policy requirements.
3. AI never directly executes forbidden tools.
4. Tool actions are tenant-scoped and audited.
5. Policy engine, not model text, authorizes tool execution.

