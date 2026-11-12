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

import {
  activeReaderSummaryModel,
  activeReaderSummaryProvider,
  activeReaderSummaryPurposes,
  frozenLegacyReaderSummaryRecoveryContract,
  gatewayDefaultReasoningEffort,
  isCodexGatewayOnlyReaderSummaryModel,
  isGatewayReaderSummaryBackend,
  isGatewayReaderSummaryExecution,
  mimoReaderSummaryBackend,
  mimoReaderSummaryModel,
  type FrozenLegacyReaderSummaryRecoveryContract,
} from "./active-reader-summary-generation-profile";

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
  const mimoGeneration = params.legacyRecoveryContract === undefined &&
    (params.taskRole === "summary" &&
      (params.command.purpose === activeReaderSummaryPurposes.generate ||
        params.command.purpose === activeReaderSummaryPurposes.repair) ||
      params.taskRole === "daily_editor" &&
        params.command.purpose === activeReaderSummaryPurposes.dailyEditorial) &&
    params.command.controls.modelBackend === mimoReaderSummaryBackend;
  // A gateway-only backend or Codex model carries its own model and effort;
  // the command is the configured route, so the attestation must repeat it
  // exactly and come from the gateway engine.
  const gatewayRoute = isGatewayReaderSummaryBackend(params.command.controls.modelBackend) ||
    (!mimoGeneration && isCodexGatewayOnlyReaderSummaryModel(params.command.controls.model));
  const expectedModel = mimoGeneration
    ? mimoReaderSummaryModel
    : gatewayRoute ? params.command.controls.model : activeReaderSummaryModel;
  const expectedEffort = gatewayRoute
    ? params.command.controls.reasoningEffort ?? gatewayDefaultReasoningEffort
    : expectedReasoningEffort(params.legacyRecoveryContract);
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

const expectedReasoningEffort = (
  legacyRecoveryContract?: FrozenLegacyReaderSummaryRecoveryContract,
): "high" | "xhigh" =>
  legacyRecoveryContract === frozenLegacyReaderSummaryRecoveryContract
    ? "xhigh"
    : "high";
