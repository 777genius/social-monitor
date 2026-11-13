import type { AgentRuntimeTaskResult } from "../../ports";
type PresentationTaskFailure = NonNullable<AgentRuntimeTaskResult["failure"]>;

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
 * Keep run-wide account, capacity and validation evidence fatal even when the
 * task failure code might otherwise be eligible for a local retry.
 */
export const isRunWidePresentationFailure = (failure: PresentationTaskFailure): boolean => {
  const details = failure.details ?? {};
  return Object.keys(details).some((key) => key === "capacityReason" || key === "cooldownUntil" ||
      validationEvidencePrefixes.some((prefix) => key.startsWith(prefix))) ||
    (details.reason !== undefined && !transientPresentationRuntimeReasons.has(details.reason)) ||
    details.safeExecutorStatus === "waiting_capacity" ||
    runWideAccountAvailabilities.has(details.availability ?? "") ||
    runWideFailureMarker.test(
      `${failure.code} ${failure.causeCategory} ${failure.safeMessage}`.toLowerCase());
};
