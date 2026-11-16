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

/** Local code admission is separate from the run-wide failure veto. */
export const presentationTaskLocalCodeDisposition = (
  code: string,
): "retry" | "skip" | undefined => {
  if (timeoutPresentationRuntimeCodes.has(code)) return "skip";
  if (transientPresentationRuntimeCodes.has(code)) return "retry";
  return undefined;
};

/** A lost dispatch acknowledgement must not trigger another paid invocation. */
export const presentationAmbiguousEffectDisposition = (
  details: Readonly<Record<string, string>>,
): "skip" | undefined => {
  if (details.gatewayEffect === "effect_unknown" || details.gatewayCleanup === "pending") return "skip";
  return undefined;
};
