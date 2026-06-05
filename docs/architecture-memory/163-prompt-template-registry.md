# 163. Prompt and Template Registry

## Status

Locked for intelligence baseline.

## Research Anchors

- OpenAI prompting guide: https://platform.openai.com/docs/guides/prompting
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
- OpenAI evaluation best practices: https://platform.openai.com/docs/guides/evaluation-best-practices

## Decision

Prompts, schemas and output templates are versioned artifacts. They are not anonymous strings embedded inside worker code.

## Registry Record

Each prompt/template includes:

- id;
- semantic purpose;
- version;
- input schema version;
- output schema version;
- model compatibility;
- safety notes;
- owner;
- eval suite id;
- rollout status;
- created/approved timestamps;
- changelog.

## Rollout States

```text
draft
eval_only
canary
active
deprecated
disabled
```

## Rules

- Production prompt changes require eval run.
- Structured outputs require schema validation.
- Summary artifacts store prompt/template version.
- Rollback must be possible without redeploy where feasible.
- Canary rollout records tenant/topic/model impact.
- Prompt injection mitigations are part of template review.

## Best-Fact Choice

Prompt changes are code changes for product behavior. Version and evaluate them like any other behavior-affecting artifact.

