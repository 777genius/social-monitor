import type { AgentRuntimeTaskResult } from "../../ports";
import { isRunWidePresentationFailure } from "./agent-runtime-promotion-presentation-v3-run-wide-failure-policy";
import {
  presentationTaskLocalCodeDisposition,
  presentationAmbiguousEffectDisposition,
} from "./agent-runtime-promotion-presentation-v3-local-failure-policy";

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
  const local = presentationTaskLocalCodeDisposition(failure.code);
  if (local === undefined) return undefined;
  if (isRunWidePresentationFailure(failure)) return undefined;
  return presentationAmbiguousEffectDisposition(failure.details ?? {}) ?? local;
};

// Preserve the established public import while keeping operator projection independent.
export { presentationRuntimeFailureIdentity } from "./agent-runtime-promotion-presentation-v3-runtime-failure-identity";
