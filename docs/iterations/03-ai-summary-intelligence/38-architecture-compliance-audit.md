# Iteration 03 - Architecture Compliance Audit

## Audit Goal
Verify that summarization remains evidence-based, provider-neutral, validated and cost-aware.

## Required Checks
- SummaryPolicy is a domain/application concept, not a prompt string.
- AI provider is accessed only through AiSummarizerPort.
- Final summary persistence requires validated structured output.
- Citations reference normalized feed items.
- Cost and usage telemetry are captured for each provider call.

## Critical Violations
- Uncited generated text is shown as a final summary.
- Provider response is persisted without schema and business validation.
- Prompt/model details leak into domain entities.
- Summary pipeline bypasses evaluation for prompt/model changes.

## SOLID And Clean Architecture Focus
- Single responsibility: policy validation, evidence selection and provider calls remain separate.
- Dependency inversion: use cases depend on summarizer port, not vendor SDK.
- DRY: citation validation is centralized, not duplicated across API/mobile paths.

## Evidence Required
- SummaryPolicy validation tests.
- Structured output schema tests.
- Eval harness result.
- Citation trace sample.
- Cost telemetry sample.

## Closure Rule
Iteration 04 cannot start if mobile cannot explain summary trust through citations and status.
