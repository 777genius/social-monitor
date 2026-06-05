# Iteration 03 - Architecture Decision Record Seeds

## Purpose
List AI and summary decisions that must be recorded for trust, cost and portability.

## ADR Seeds
- Require citations for final summaries.
- Use AiSummarizerPort for provider isolation.
- Validate structured output before persistence.
- Establish eval harness for prompt/model changes.
- Record usage and cost telemetry per summary job.

## Alternatives To Capture
- Fast uncited summaries vs cited trust-first summaries.
- Single provider SDK in use case vs provider port.
- Manual quality review vs repeatable eval harness.

## Consequences To Record
- Citation enforcement can reject fluent but unsupported output.
- Provider port adds abstraction but enables swapping and fallback.
- Evals add maintenance but prevent silent prompt regressions.

## Revisit Triggers
- Citation strictness blocks useful summaries.
- Provider pricing or quality changes.
- Beta feedback shows low summary trust.
