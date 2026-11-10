import type { AgentRuntimeTaskResult } from "../../ports";

// Per-task runtime outcomes that say nothing about the presented stories.
// Unknown codes stay fatal until they are classified on purpose.
const transientPresentationRuntimeCodes = new Set([
  "task_cancelled",
  "unknown_runtime_failure",
  "provider_output_invalid",
  "agent_runtime.failed",
  "agent_runtime.cli_exit",
  "agent_runtime.invalid_cli_result",
  // A known, closed gateway failure may buy one replacement. Lost dispatch
  // acknowledgements and pending cleanup are filtered below, never replayed.
  "provider_effect_unknown",
  "provider_failed",
  "provider_output_lost",
]);
// A timeout already spent the whole per-task deadline the native V3 budget
// reserves for this call, so it is skipped without a second attempt.
const timeoutPresentationRuntimeCodes = new Set([
  "task_timeout",
  "agent_runtime.cli_timeout",
]);
// Classified runtime reasons that stay per-task. Every other reason (quota,
// capacity, account, reconnect, permission, model or budget) is run-wide.
const transientPresentationRuntimeReasons = new Set([
  "user_abort", "runtime_interrupted", "unknown_error", "provider_output_invalid",
  "task_timeout",
]);
// An account the runtime reports as cooling down, exhausted or disabled stays
// that way for every later batch.
const runWideAccountAvailabilities = new Set(["cooldown", "quota_exhausted", "disabled"]);
const runWideFailureMarker =
  /quota|rate[\s_-]?limit|too[\s_-]many[\s_-]requests|\b429\b|attestation|credential|reconnect/u;

// Validator evidence keeps its own exact contracts in the builder.
const validationEvidencePrefixes = [
  "outputValidation", "presentationValidation", "presentationRejected",
];

/**
 * How a failed presentation task may be absorbed: `retry` once, or `skip` the
 * batch as `runtime_failure` right away. `undefined` means the failure carries
 * validation evidence or a run-wide cause and must keep failing the job.
 */
export const presentationRuntimeFailureDisposition = (
  result: AgentRuntimeTaskResult,
): "retry" | "skip" | undefined => {
  const failure = result.status === "failed" ? result.failure : undefined;
  if (failure === undefined || failure.reconnectRequired) return undefined;
  const timedOut = timeoutPresentationRuntimeCodes.has(failure.code);
  if (!timedOut && !transientPresentationRuntimeCodes.has(failure.code)) return undefined;
  const details = failure.details ?? {};
  if (Object.keys(details).some((key) => key === "capacityReason" || key === "cooldownUntil" ||
      validationEvidencePrefixes.some((prefix) => key.startsWith(prefix)))) return undefined;
  if ((details.reason !== undefined && !transientPresentationRuntimeReasons.has(details.reason)) ||
      details.safeExecutorStatus === "waiting_capacity" ||
      runWideAccountAvailabilities.has(details.availability ?? "")) return undefined;
  if (runWideFailureMarker.test(
    `${failure.code} ${failure.causeCategory} ${failure.safeMessage}`.toLowerCase())) return undefined;
  // A lost dispatch acknowledgement is not permission to buy another call.
  // Preserve its effect for operator reconciliation instead of replaying it.
  if (details.gatewayEffect === "effect_unknown" || details.gatewayCleanup === "pending") return "skip";
  return timedOut ? "skip" : "retry";
};

// Preserve the established public import while keeping operator projection independent.
export { presentationRuntimeFailureIdentity } from "./agent-runtime-promotion-presentation-v3-runtime-failure-identity";
