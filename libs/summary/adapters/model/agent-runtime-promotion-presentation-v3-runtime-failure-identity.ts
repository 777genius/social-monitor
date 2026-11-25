import type { ReaderPostPresentationRuntimeFailure } from
  "../../domain/services/reader-post-presentation-v3";
import type { AgentRuntimeTaskResult } from "../../ports";

/** Operator-safe identifiers of a skipped task: codes only, never messages or details. */
export const presentationRuntimeFailureIdentity = (
  result: AgentRuntimeTaskResult,
): ReaderPostPresentationRuntimeFailure => ({
  code: runtimeIdentifier(result.failure?.code),
  causeCategory: runtimeIdentifier(result.failure?.causeCategory),
  ...(result.failure?.details?.gatewayCleanup === "closed" &&
      ["completed", "not_dispatched", "response_started"].includes(result.failure.details.gatewayEffect ?? "")
    ? { executionClosed: true } : {}),
  ...runtimeTiming(result.failure?.details),
  ...runtimeReferences(result.failure?.details),
});

/** Only identifiers issued by this SDK, never arbitrary provider diagnostics. */
const runtimeReferences = (details: Readonly<Record<string, string>> | undefined):
Pick<ReaderPostPresentationRuntimeFailure, "executionRef" | "requestRef"> => {
  const executionRef = details?.gatewayExecutionRef;
  const requestRef = details?.gatewayRequestRef;
  return {
    ...(executionRef !== undefined && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(executionRef)
      ? { executionRef } : {}),
    ...(requestRef !== undefined && /^sm[A-Za-z0-9_-]{43}-a[1-9][0-9]{0,3}-r$/u.test(requestRef)
      ? { requestRef } : {}),
  };
};

const runtimeTiming = (details: Readonly<Record<string, string>> | undefined):
Pick<ReaderPostPresentationRuntimeFailure, "effect" | "elapsedMs" | "timeoutMs"> => {
  const effect = details?.gatewayEffect;
  const elapsed = details?.gatewayElapsedMs;
  const timeout = details?.gatewayHardTimeoutMs;
  return {
    ...(["completed", "not_dispatched", "response_started", "effect_unknown"].includes(effect ?? "")
      ? { effect: effect as ReaderPostPresentationRuntimeFailure["effect"] } : {}),
    ...(elapsed !== undefined && /^[0-9]{1,10}$/u.test(elapsed) ? { elapsedMs: Number(elapsed) } : {}),
    ...(timeout !== undefined && /^[0-9]{1,10}$/u.test(timeout) ? { timeoutMs: Number(timeout) } : {}),
  };
};

const runtimeIdentifier = (value: string | undefined): string =>
  value !== undefined && /^[a-z][a-z0-9_.-]{0,63}$/u.test(value) ? value : "unclassified";
