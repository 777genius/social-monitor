import {
  executionAttestationOutputMatches,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type { AgentRuntimeTaskResult } from "../../ports";

/** Admit only bounded wire output forms; preserve the executor's selected-output proof. */
export const readGrpcOptionalOutputText = (value: string): string | undefined =>
  value.trim().length === 0 ? undefined : value;

export const readGrpcOptionalStructuredOutput = (
  value: string,
): Record<string, unknown> | undefined => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    // Native parser errors can quote provider output in persisted job failures.
    throw new SyntaxError("Agent runtime structured output is not valid JSON");
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Agent runtime structured output must be a JSON object");
  }

  return parsed as Record<string, unknown>;
};

/** A completed result must carry matching output attestation; failures must not carry one. */
export const assertGrpcTaskOutputTrust = (result: AgentRuntimeTaskResult): void => {
  if (
    result.status === "completed" &&
    (result.executionAttestation === undefined ||
      !executionAttestationOutputMatches(result.executionAttestation, result))
  ) {
    throw new Error(
      "Completed agent runtime response has an invalid output attestation",
    );
  }
  if (
    result.status !== "completed" &&
    result.executionAttestation !== undefined
  ) {
    throw new Error(
      "Non-completed agent runtime response must not be attested",
    );
  }
};
