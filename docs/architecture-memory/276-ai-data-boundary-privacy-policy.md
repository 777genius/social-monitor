# 276 - AI Data Boundary Privacy Policy

## Decision

LLM calls receive the minimum data needed to generate tenant-requested summaries.

Raw provider payloads, credentials, private metadata and unrelated tenant data must not be sent to AI providers.

## Sources

- OWASP Top 10 for LLM Applications 2025: https://owasp.org/www-project-top-10-for-large-language-model-applications/
- OWASP LLM 2025 PDF: https://owasp.org/www-project-top-10-for-large-language-model-applications/assets/PDF/OWASP-Top-10-for-LLMs-v2025.pdf
- NIST AI Risk Management Framework: https://www.nist.gov/itl/ai-risk-management-framework
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs

## Data Sent To Model

Allowed:

- normalized item excerpts
- title
- canonical URL/permalink
- public timestamp
- source type
- topic summary rules
- tenant-approved style preferences
- bounded public metrics

Avoid or redact:

- source credentials
- raw provider payload
- private user identifiers
- unnecessary author metadata
- support/admin notes
- legal-hold restricted content
- unrelated tenant data
- secrets in URLs/query parameters

## Redaction Pipeline

Before LLM call:

```text
candidate items
-> classification
-> minimization
-> secret/PII redaction
-> prompt assembly
-> budget check
-> model call
```

Redaction is not optional for high-risk data classes.

## Prompt Injection Boundary

Social posts, comments, RSS content and Telegram messages are untrusted data.

They must be clearly delimited as source material, not instructions.

However, delimiter-based prompting is not a security boundary. The system must also limit what the model can access and what side effects it can trigger.

## Output Boundary

Model output is untrusted until:

- schema validated
- citations verified
- policy checks pass
- unsafe disclosure checks pass
- hallucination/unsupported-claim checks pass where practical

Do not display raw failed output to users.

## Retention

Persist:

- structured summary
- source item references
- prompt template version
- schema version
- model id
- safety/eval metadata

Do not persist full prompts/responses by default unless tenant policy and privacy classification permit it.

Use redacted prompt logs for debugging.

## Provider Contract

Each AI provider adapter records:

- data processing terms status
- retention settings
- region/processing constraints where available
- training-use policy
- subprocessor review status
- last verified date

## Architecture Rule

The safest token is the one never sent to the model.
