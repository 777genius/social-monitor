import {
  executionAttestationOutputMatches,
  isConcreteRuntimePackageVersion,
  isSha256Hex,
  subscriptionRuntimeEngine,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "../../ports";
import { activeReaderSummaryReasoningEffort } from "./codex-reader-summary-route";
import {
  activeReaderSummaryProvider,
  activeReaderSummaryPurposes,
  mimoReaderSummaryBackend,
  mimoReaderSummaryModel,
  mimoPresentationReasoningEffort,
} from "./reader-summary-runtime-contract";

// Pure fail-closed task/receipt admission; never records an unverified response.
export const assertMimoReaderSummaryExecution = (params: {
  readonly command: AgentRuntimeTaskCommand;
  readonly result: AgentRuntimeTaskResult;
  readonly purpose: string;
}): NonNullable<AgentRuntimeTaskResult["executionAttestation"]> => {
  const attestation = params.result.executionAttestation;
  if (params.command.purpose !== params.purpose ||
    params.command.provider !== activeReaderSummaryProvider ||
    params.command.controls.model !== mimoReaderSummaryModel ||
    params.command.controls.modelBackend !== mimoReaderSummaryBackend ||
    params.result.status !== "completed" ||
    attestation === undefined ||
    attestation.schemaVersion !== 1 ||
    attestation.requestId !== params.command.requestId ||
    attestation.purpose !== params.purpose ||
    attestation.provider !== activeReaderSummaryProvider ||
    attestation.model !== mimoReaderSummaryModel ||
    params.command.controls.reasoningEffort !== (params.purpose === activeReaderSummaryPurposes.promotionPresentation
      ? mimoPresentationReasoningEffort : activeReaderSummaryReasoningEffort) ||
    attestation.reasoningEffort !== (params.purpose === activeReaderSummaryPurposes.promotionPresentation
      ? mimoPresentationReasoningEffort : activeReaderSummaryReasoningEffort) ||
    attestation.runtimeEngine !== subscriptionRuntimeEngine ||
    !isConcreteRuntimePackageVersion(attestation.runtimePackageVersion) ||
    !isSha256Hex(attestation.canonicalRequestSha256) ||
    !isSha256Hex(attestation.launcherSha256) ||
    attestation.selectedOutputKind !== "structured_output" ||
    !isSha256Hex(attestation.selectedOutputSha256) ||
    !executionAttestationOutputMatches(attestation, params.result)) {
    throw new Error("Reader summary execution attestation is invalid");
  }
  return attestation;
};
