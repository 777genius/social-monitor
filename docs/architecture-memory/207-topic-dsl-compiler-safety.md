# 207. Topic DSL Compiler Safety

## Status

Locked for topic/rules baseline.

## Research Anchors

- Open Policy Agent Rego language: https://www.openpolicyagent.org/docs/policy-language
- JSON Schema specification: https://json-schema.org/specification

## Decision

Topic rules are user-defined policy/query artifacts. Compile them into validated provider-neutral query plans before execution.

## Compilation Pipeline

```text
user rule input
-> parse
-> validate syntax/schema
-> normalize terms/language/source filters
-> estimate cost/fanout
-> check entitlements/source policy
-> compile provider-specific query plans
-> persist rule version
```

## Safety Checks

Reject or require approval for:

- unbounded wildcard queries;
- too many OR terms;
- unsupported source operators;
- scan interval below plan/source policy;
- high-cost backfill;
- source-policy disallowed terms/use;
- rules that would exceed tenant quota.

## Versioning

Every topic rule update creates a new version. Scans and summaries record the rule version used.

## Best-Fact Choice

Do not execute user topic rules directly against providers. A compiler layer is needed for safety, cost control, provider portability and explainability.

