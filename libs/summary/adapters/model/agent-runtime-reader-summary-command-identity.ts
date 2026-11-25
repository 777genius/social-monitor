import { readerSummaryScopeKey } from "../../domain";
import type { AgentRuntimeTaskCommand, ReaderSummaryModelInput } from "../../ports";
import { buildAgentRuntimeRequestId } from "./agent-runtime-model-support";
import {
  activeReaderSummaryPurposes,
  frozenLegacyReaderSummaryRecoveryContract,
} from "./reader-summary-runtime-contract";

/** Own request/correlation identity and the immutable legacy-vs-active task purpose.
 * The task-command assembler retains payload, schema, controls and transport policy.
 */
export const readerSummaryCommandIdentity = (params: Readonly<{
  input: ReaderSummaryModelInput;
  attempt: "primary" | "repair";
  legacyRecovery: boolean;
}>): Readonly<Pick<AgentRuntimeTaskCommand, "requestId" | "correlationId" | "purpose">> => {
  const { input, attempt, legacyRecovery } = params;
  const isRepair = attempt === "repair";
  return {
    requestId: buildAgentRuntimeRequestId(
      isRepair ? "reader-summary-repair" : "reader-summary",
      input.tenantId,
      input.workspaceId,
      readerSummaryScopeKey(input.scope),
      input.requestedAt,
    ),
    correlationId: buildAgentRuntimeRequestId(
      "reader-summary-correlation",
      input.tenantId,
      input.workspaceId,
      readerSummaryScopeKey(input.scope),
      input.requestedAt,
    ),
    purpose: isRepair
      ? legacyRecovery
        ? frozenLegacyReaderSummaryRecoveryContract.purposes.repair
        : activeReaderSummaryPurposes.repair
      : legacyRecovery
        ? frozenLegacyReaderSummaryRecoveryContract.purposes.generate
        : activeReaderSummaryPurposes.generate,
  };
};
