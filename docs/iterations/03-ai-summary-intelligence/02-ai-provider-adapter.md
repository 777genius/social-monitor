# Iteration 03 / Phase 02 - AI Provider Adapter

## Objective

Implement replaceable AI provider port with structured output and budget control.

## Steps

1. Define `SummaryModelPort`.
2. Implement OpenAI adapter with structured outputs.
3. Add timeout/retry/circuit breaker.
4. Add token estimation and budget preflight.
5. Add prompt caching-friendly prompt layout.
6. Add provider metadata capture.
7. Add failure mapping.
8. Add prompt-injection boundary: source content is evidence, never instruction.
9. Add schema validation before persistence.
10. Add provider fallback decision rules.
11. Add model/prompt version pinning for reproducible evals.

## SummaryModelPort Shape

The adapter contract should preserve this behavior:

```text
SummaryModelPort
  route(request, policy, budget): ModelRoute
  estimate(input, route): TokenCostEstimate
  summarize(input, route, context): ProviderSummaryAttempt
  validateRawProviderResponse(response, schema): ValidationResult
  classifyError(error, context): AiProviderFailure
```

Port boundaries:

1. Domain/application passes structured evidence, not raw provider prompts.
2. Adapter constructs provider request and owns provider-specific SDK DTOs.
3. Provider response is untrusted until schema and business validation pass.
4. Application layer decides whether an attempt becomes `completed`, `review_required`, `no_signal` or `failed`.
5. Fake provider must implement the same port and produce deterministic fixture outputs.

## Prompt Boundary Rules

1. System/developer instructions are static, versioned and never built from source content.
2. User summary rules are validated configuration, not untrusted prompt fragments.
3. Source item text is evidence only and is delimited/encoded as data.
4. Source content that says "ignore previous instructions" is treated as text to summarize, not instruction.
5. Prompt variables are whitelisted and rendered through templates.
6. Raw prompt logging is disabled by default; debug capture requires explicit safe mode and redaction.
7. Prompt/schema/model version is stored even when provider attempt fails.

## Fallback And Repair Policy

Allowed in MVP:

1. one bounded retry for transient provider failure
2. one bounded structured-output repair attempt when raw content is parseable and budget allows
3. fallback from primary model route to cheaper/safer configured route only if schema behavior is certified

Not allowed in MVP:

1. unlimited retries
2. fallback that bypasses budget preflight
3. fallback to a model not covered by eval fixtures
4. displaying repaired output before citation/business validation
5. silently changing summary language/style to satisfy provider limitations

Failure classes:

- `budget_exceeded`
- `provider_rate_limited`
- `provider_unavailable`
- `invalid_schema`
- `citation_validation_failed`
- `prompt_injection_detected`
- `source_policy_disallows_ai`
- `tenant_ai_disabled`
- `context_too_large`
- `unsafe_or_refused`

## Edge Cases

- Model returns invalid schema.
- Provider rate limits.
- Context too large.
- Tenant budget exhausted.
- Provider refuses unsafe input.
- Source item contains instructions aimed at the summarizer.
- Provider returns plausible but uncited claims.
- Fallback model has different schema behavior or higher cost.
- Provider returns valid JSON with citations to non-existent ids.
- Provider emits hidden prompt text in user-visible fields.
- Repair attempt fixes JSON syntax but changes factual content.
- Token estimate undercounts because provider tokenizer differs.
- Provider returns localized output in wrong language.

## Pay Attention

- AI output is untrusted until validated.
- Do not log raw prompts by default.
- Do not send credentials/raw payloads to model.
- Redact or minimize source payloads before model calls where possible.
- Retries must not bypass budget or duplicate completed summaries.
- Keep provider SDK details in infrastructure adapters only.
- Treat schema validation and business validation as separate gates.
- Store provider attempt metadata safely; do not store raw secrets/prompts by default.

## Acceptance Criteria

- Adapter can be swapped with fake model.
- Invalid output fails safely.
- Budget exceeded returns typed error.
- Provider outage does not break ingestion.
- Prompt/model/provider version is attached to each summary attempt.
- Prompt-injection fixture cannot change system/developer instructions.
- Fallback/repair attempts are bounded, budgeted and covered by eval fixtures.
- Provider failure classes map to user/support-safe summary status.
