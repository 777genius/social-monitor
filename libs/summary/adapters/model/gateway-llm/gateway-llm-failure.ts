import type { LlmFailure, LlmFailureCode } from "@agent-teams/account-gateway/llm";

import type { AgentRuntimeFailure } from "../../../ports";
import type { GatewayLlmAttemptIdentity } from "./gateway-llm-attempts";
import { safeOutputViolationPattern } from "./gateway-llm-output-violations";

type FailureShape = {
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

/** Strict-decode verdict on rejected output; absent when decode never ran. */
export type GatewayLlmOutputViolations = {
  /** The decode's own first path:keyword. */
  readonly first: string;
  /** Every violation found, path:keyword or path:keyword=limit. */
  readonly all: readonly string[];
};

export const gatewayLlmFailure = (
  failure: LlmFailure,
  identity: GatewayLlmAttemptIdentity,
  outputViolations?: GatewayLlmOutputViolations,
): AgentRuntimeFailure => {
  const shape = failureShapes[failure.code];
  const retry = failure.retry;
  return {
    code: shape.code,
    safeMessage: shape.safeMessage,
    retryable: retry.kind !== "never",
    reconnectRequired: shape.reconnectRequired === true,
    causeCategory: shape.causeCategory,
    details: {
      ...shape.details,
      ...(failure.code === "output_invalid" ? {
        outputValidationPath: safeOutputViolation(outputViolations?.first),
        outputValidationViolations: (outputViolations?.all ?? [])
          .filter((entry) => safeOutputViolationPattern.test(entry)).join(" "),
      } : {}),
      gatewayCode: failure.code,
      gatewayEffect: failure.effect,
      gatewayRetry: retry.kind,
      gatewayRetryAfterMs: retry.kind === "never" ? "0" : String(retry.afterMs),
      gatewayMayDuplicateCost: retry.kind === "new_attempt"
        ? String(retry.mayDuplicateCost) : "false",
      gatewayCleanup: failure.cleanup,
      gatewayTaskId: identity.taskId,
      gatewayAttempt: String(identity.attempt),
      ...(failure.traceRef === undefined ? {} : { gatewayTraceRef: failure.traceRef }),
      ...(failure.execution === null ? {} : {
        gatewayExecutionRef: failure.execution.executionRef,
        gatewayRequestRef: failure.execution.requestRef,
        gatewayAccountRef: failure.execution.accountRef,
      }),
    },
  };
};

/**
 * A schema path and keyword only, never output text. Keys the model invented
 * can appear in the path, so anything outside a plain path shape is dropped.
 * Without a decode the text was empty or not JSON.
 */
const safeOutputViolation = (violation: string | undefined): string =>
  violation === undefined ? "json_parse_or_empty"
    : /^\$[A-Za-z0-9_.[\]]{0,160}:[A-Za-z_]{1,32}$/u.test(violation) ? violation : "unclassified";

/**
 * The paid output is discarded: an attestation must never bind a model the
 * provider did not confirm. Retrying is the caller's paid decision.
 */
export const gatewayLlmModelMismatch = (
  identity: GatewayLlmAttemptIdentity,
): AgentRuntimeFailure => ({
  code: "provider_model_mismatch",
  safeMessage: "Provider reported a different model than requested",
  retryable: false,
  reconnectRequired: false,
  causeCategory: "model_identity",
  details: { gatewayEffect: "completed", gatewayTaskId: identity.taskId,
    gatewayAttempt: String(identity.attempt) },
});

/** Local failures before any gateway call; nothing was dispatched or paid. */
export const gatewayLlmLocalFailure = (
  code: "invalid_request" | "unsupported_route" | "invalid_schema",
  safeMessage: string,
): AgentRuntimeFailure => ({
  code,
  safeMessage,
  retryable: false,
  reconnectRequired: false,
  causeCategory: code === "invalid_schema" ? "output_schema" : "invalid_request",
  details: { gatewayEffect: "not_dispatched" },
});
