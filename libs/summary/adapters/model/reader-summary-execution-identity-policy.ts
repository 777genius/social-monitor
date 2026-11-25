import {
  executionAttestationOutputMatches,
  isAttestedRuntimeIdentity,
  isSha256Hex,
  subscriptionRuntimeEngine,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";

import type {
  AgentRuntimeExecutionAttestation,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
} from "../../ports";
import {
  readerSummaryAttestedPurposeMatches,
  type ReaderSummaryAttestedTaskRole,
} from "./reader-summary-attested-purpose-policy";
export type { ReaderSummaryAttestedTaskRole } from "./reader-summary-attested-purpose-policy";

import { isGatewayReaderSummaryExecution } from "./reader-summary-gateway-execution-policy";
import type { FrozenLegacyReaderSummaryRecoveryContract } from "./reader-summary-runtime-contract";
import { expectedReaderSummaryExecutionRoute } from "./reader-summary-execution-route-identity";
import { activeReaderSummaryProvider } from "./reader-summary-runtime-contract";

// Owns the fail-closed identity policy. The execution sink belongs to the
// adapter-facing attestation recorder, not to this pure validation boundary.

export const validateReaderSummaryExecutionAttestation = (params: {
  readonly command: AgentRuntimeTaskCommand;
  readonly result: AgentRuntimeTaskResult;
  readonly taskRole: ReaderSummaryAttestedTaskRole;
  readonly attempt: string;
  readonly selectedOutputKind?: "structured_output" | "output_text";
  readonly legacyRecoveryContract?: FrozenLegacyReaderSummaryRecoveryContract;
}): AgentRuntimeExecutionAttestation => {
  const attestation = params.result.executionAttestation;
  const { mimoGeneration, gatewayRoute, expectedModel, expectedEffort } =
    expectedReaderSummaryExecutionRoute(params);
  if (
    params.result.status !== "completed" ||
    attestation === undefined ||
    attestation.schemaVersion !== 1 ||
    attestation.requestId !== params.command.requestId ||
    attestation.purpose !== params.command.purpose ||
    attestation.provider !== params.command.provider ||
    attestation.provider !== activeReaderSummaryProvider ||
    attestation.model !== expectedModel ||
    params.command.controls.model !== expectedModel ||
    (params.command.controls.modelBackend !== undefined &&
      params.command.controls.modelBackend !== "openai-chatgpt" &&
      !mimoGeneration && !gatewayRoute) ||
    (gatewayRoute && (params.legacyRecoveryContract !== undefined ||
      !isGatewayReaderSummaryExecution(attestation))) ||
    attestation.reasoningEffort !== expectedEffort ||
    !readerSummaryAttestedPurposeMatches(
      params.taskRole,
      params.attempt,
      attestation.purpose,
      params.legacyRecoveryContract,
    ) ||
    // MiMo generation runs only through the CLI runtime.
    (mimoGeneration && attestation.runtimeEngine !== subscriptionRuntimeEngine) ||
    !isAttestedRuntimeIdentity(attestation) ||
    !isSha256Hex(attestation.canonicalRequestSha256) ||
    attestation.selectedOutputKind !== (params.selectedOutputKind ?? "structured_output") ||
    (params.selectedOutputKind === "output_text" && params.taskRole !== "weekly_generate") ||
    !isSha256Hex(attestation.selectedOutputSha256) ||
    !executionAttestationOutputMatches(attestation, params.result)
  ) {
    throw new Error("Reader summary execution attestation is invalid");
  }

  return attestation;
};

