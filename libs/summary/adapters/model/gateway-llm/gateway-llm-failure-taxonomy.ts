import type { LlmFailureCode } from "@agent-teams/account-gateway/llm";

export type FailureShape = {
  readonly code: string;
  readonly causeCategory: string;
  readonly safeMessage: string;
  readonly reconnectRequired?: true;
  readonly details?: Readonly<Record<string, string>>;
};

/**
 * Codes and cause categories reuse the vocabulary the summary adapters
 * already classify (rate/quota, token, schema, refusal, task_cancelled), so a
 * gateway failure degrades exactly like the equivalent CLI runtime failure.
 */
const failureShapes: Readonly<Record<LlmFailureCode, FailureShape>> = {
  invalid_task: { code: "invalid_request", causeCategory: "invalid_request",
    safeMessage: "Gateway rejected the task before dispatch" },
  rejected: { code: "provider_rejected_request", causeCategory: "rejected",
    safeMessage: "Gateway or provider rejected the request" },
  unauthorized: { code: "provider_auth_required", causeCategory: "authorization",
    safeMessage: "Gateway account authorization is not usable", reconnectRequired: true },
  busy: { code: "provider_rate_limited", causeCategory: "quota",
    safeMessage: "Gateway accounts are at capacity" },
  unavailable: { code: "provider_unavailable", causeCategory: "unavailable",
    safeMessage: "Gateway has no usable account for the task" },
  conflict: { code: "execution_conflict", causeCategory: "conflict",
    safeMessage: "Gateway attempt identity conflicts with an earlier intent" },
  provider_failed: { code: "provider_failed", causeCategory: "provider",
    safeMessage: "Provider failed the request" },
  output_truncated: { code: "provider_output_truncated", causeCategory: "output_token_limit",
    safeMessage: "Provider output reached the output token limit" },
  output_refused: { code: "provider_output_refused", causeCategory: "refusal",
    safeMessage: "Provider refused the request" },
  output_invalid: { code: "provider_output_invalid", causeCategory: "output_schema",
    safeMessage: "Provider output failed structured output validation",
    details: { outputValidationStage: "schema_normalization",
      outputValidationCode: "schema_normalization_failed" } },
  output_lost: { code: "provider_output_lost", causeCategory: "output_lost",
    safeMessage: "Provider output was not received" },
  effect_unknown: { code: "provider_effect_unknown", causeCategory: "effect_unknown",
    safeMessage: "Provider effect of the request is unknown" },
  cancelled: { code: "task_cancelled", causeCategory: "cancelled",
    safeMessage: "Gateway task was cancelled" },
  deadline: { code: "task_timeout", causeCategory: "deadline",
    safeMessage: "Gateway task reached its deadline" },
};

export const gatewayLlmFailureShape = (
  code: LlmFailureCode,
): FailureShape => failureShapes[code];
