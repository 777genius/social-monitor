import type { AgentRuntimeTaskCommand } from "../../ports";
import type { ReaderSummaryAttestedTaskRole } from "./reader-summary-attested-purpose-policy";
import {
  activeReaderSummaryModel,
  activeReaderSummaryPurposes,
  frozenLegacyReaderSummaryRecoveryContract,
  gatewayDefaultReasoningEffort,
  isCodexGatewayOnlyReaderSummaryModel,
  isGatewayReaderSummaryBackend,
  mimoReaderSummaryBackend,
  mimoReaderSummaryModel,
  type FrozenLegacyReaderSummaryRecoveryContract,
} from "./active-reader-summary-generation-profile";

/**
 * Resolve the route the scoped command must attest. This is a pure command
 * policy: the caller still verifies the actual response, engine, digests and
 * purpose before accepting any output or recording an attestation.
 */
export const expectedReaderSummaryExecutionRoute = (params: {
  readonly command: AgentRuntimeTaskCommand;
  readonly taskRole: ReaderSummaryAttestedTaskRole;
  readonly legacyRecoveryContract?: FrozenLegacyReaderSummaryRecoveryContract;
}) => {
  const mimoGeneration = params.legacyRecoveryContract === undefined &&
    (params.taskRole === "summary" &&
      (params.command.purpose === activeReaderSummaryPurposes.generate ||
        params.command.purpose === activeReaderSummaryPurposes.repair) ||
      params.taskRole === "daily_editor" &&
        params.command.purpose === activeReaderSummaryPurposes.dailyEditorial) &&
    params.command.controls.modelBackend === mimoReaderSummaryBackend;
  // The gateway command names the actual model and effort, never CLI defaults.
  const gatewayRoute = isGatewayReaderSummaryBackend(params.command.controls.modelBackend) ||
    (!mimoGeneration && isCodexGatewayOnlyReaderSummaryModel(params.command.controls.model));
  const expectedModel = mimoGeneration
    ? mimoReaderSummaryModel
    : gatewayRoute ? params.command.controls.model : activeReaderSummaryModel;
  const expectedEffort = gatewayRoute
    ? params.command.controls.reasoningEffort ?? gatewayDefaultReasoningEffort
    : params.legacyRecoveryContract === frozenLegacyReaderSummaryRecoveryContract
      ? "xhigh"
      : "high";
  return { mimoGeneration, gatewayRoute, expectedModel, expectedEffort };
};
