# 277 - AI Evaluation Regression Harness

## Decision

Summary behavior is protected by an evaluation harness before prompt, schema, model or retrieval changes ship.

Manual review alone is not enough.

## Sources

- OpenAI Evals API reference: https://platform.openai.com/docs/api-reference/evals
- OpenAI Evals cookbook: https://cookbook.openai.com/examples/evaluation/getting_started_with_openai_evals
- NIST AI RMF: https://www.nist.gov/itl/ai-risk-management-framework
- OWASP Top 10 for LLM Applications: https://owasp.org/www-project-top-10-for-large-language-model-applications/

## Evaluation Types

Required:

- schema conformance
- citation correctness
- unsupported claim detection
- relevance to topic rules
- safety/redaction checks
- prompt-injection resistance
- summary usefulness scoring
- cost/token regression
- latency regression

## Golden Dataset

Maintain datasets for:

- Hacker News stories/comments
- RSS/Atom posts
- Reddit-like fixture payloads
- X-like fixture payloads
- Telegram-like fixture payloads
- adversarial prompt injection examples
- multilingual examples
- duplicate/clustered items
- low-signal/noisy windows

Fixtures must be privacy-safe and terms-reviewed.

## Evaluation Output

Each eval run records:

```text
eval_run_id
prompt_version
schema_version
model_id
retrieval_version
dataset_version
scores
failures
cost
latency
created_at
git_sha
```

## Release Gates

Block release if:

- schema failures increase
- citation accuracy drops below threshold
- redaction test fails
- prompt-injection test causes unsafe output/action
- cost exceeds budget threshold
- latency exceeds SLO threshold for interactive path

Thresholds are per feature class.

## Human Evaluation

Use human review for:

- usefulness
- tone
- business relevance
- ambiguous summaries
- new source types
- changed prompt strategy

Human labels become eval dataset inputs.

## Model-Based Evaluation

Model-graded evals are allowed, but they are not ground truth.

Use them for scalable triage, then calibrate against human labels.

## Architecture Rule

If summary quality cannot be measured, it cannot be safely optimized.
