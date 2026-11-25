# AI Decision Logging

Date: 2026-05-31
Status: baseline AI decision logging memory

## Decision

AI-assisted decisions must be traceable enough to debug quality, cost and safety.

Do not log full prompts/raw source text by default. Log structured metadata and references.

## Log For Each AI Job

```text
ai_job_id
tenant_id
job_type
model_provider
model
model_version
prompt_template_version
summary_rule_version nullable
input_refs
output_ref
schema_version
token_input_count
token_output_count
cost_estimate
latency_ms
validation_status
trust_level
error_class nullable
created_at
```

## Input Refs

Use references:

```text
source_item_ids
cluster_id
raw_payload_refs
rule_version
prompt_template_version
```

Avoid storing:

- full raw prompt;
- full source text;
- secrets;
- connector credentials.

## Tool/Action Logging

If future agents use tools, log:

```text
tool_name
tool_scope
tool_input_ref
policy_decision
approval_id nullable
result_status
```

No tool call should bypass policy logging.

## Locked Decisions

1. AI jobs have structured metadata logs.
2. Full prompts/source text are not logged by default.
3. Inputs/outputs are referenced, not blindly copied.
4. Tool calls, if added later, are policy-logged.
5. AI decision logs support eval, cost and incident investigation.

