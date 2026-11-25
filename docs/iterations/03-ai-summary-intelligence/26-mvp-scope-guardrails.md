# Iteration 03 - MVP Scope Guardrails

## In Scope

1. Summary policy.
2. Evidence/citation model.
3. AI provider port.
4. Structured output validation.
5. Eval harness.
6. Cost tracking.
7. Summary and feedback APIs.

## Out Of Scope

1. Multi-agent research workflows.
2. Fully custom model training.
3. Complex personalization beyond summary rules.
4. Uncited user-visible summaries.

## Scope Creep Signals

- Prompt experiments delay evidence/citation model.
- Model choice discussions happen before provider port.
- Personalization expands before feedback data exists.

## Decision Rule

Accept AI work only if it makes summaries cited, auditable, useful or cost-controlled.

## Complexity Budget

- Build deeply: summary policy, evidence model, structured output validation, claim citations, evals, cost telemetry and feedback API.
- Define lightly: provider fallback port, prompt/version lineage and future personalization extension.
- Defer: multi-agent workflows, fine-tuning, complex preference learning and broad research automation.
