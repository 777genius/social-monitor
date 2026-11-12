import type {
  ReaderPostPresentationV3Input,
  ReaderPostPresentationV3Result,
} from "../../domain/services/reader-post-presentation-v3";
import type { AgentRuntimeClientPort } from "../../ports";
import { readAgentRuntimeObjectOutput } from "./agent-runtime-model-support";
import {
  mimoReaderSummaryBackend,
  assertMimoReaderSummaryExecution,
  activeReaderSummaryPurposes,
  type ReaderSummaryGenerationBackend,
} from "./active-reader-summary-generation-profile";
import { presentationRuntimeFailureDisposition } from "./agent-runtime-promotion-presentation-v3-runtime-failure";
import { presentationRuntimeFailureIdentity } from "./agent-runtime-promotion-presentation-v3-runtime-failure-identity";
import { parseObject } from "./agent-runtime-promotion-presentation-v3-request";
import type { createPromotionPresentationTaskCommand } from "./agent-runtime-promotion-presentation-v3-task-command";
import {
  runtimePresentationValidationRejection,
  completedPromotionPresentationResults,
} from "./agent-runtime-promotion-presentation-v3-result-policy";

type PresentationExecutionInput = ReturnType<typeof createPromotionPresentationTaskCommand> & {
  readonly client: AgentRuntimeClientPort;
  readonly inputs: readonly ReaderPostPresentationV3Input[];
  readonly modelBackend: ReaderSummaryGenerationBackend;
};

/**
 * Owns provider task dispatch, bounded retry, fail-closed runtime/output admission,
 * execution attestation and per-story cleanup propagation. The builder owns
 * only batch size, provider-specific isolation and request admission.
 */
export const executeAgentRuntimePromotionPresentation = async ({
  client, command, inputs, catalogCandidates, sourceCopyWire, modelBackend,
}: PresentationExecutionInput): Promise<readonly ReaderPostPresentationV3Result[]> => {
    let result = await client.runTask(command);
    // A transient runtime failure (cancellation, crashed run, empty failure,
    // timeout) says nothing about the stories on either backend: resend the same
    // request once unless it already used its deadline (a runtime that has
    // exhausted this request answers at once), then skip only this batch under
    // its own runtime_failure reason. The promotion run discloses the gap and
    // stops when runtime failures repeat.
    if (presentationRuntimeFailureDisposition(result) === "retry") {
      result = await client.runTask(command);
    }
    const cleanupPending = result.warnings.some(warning => warning.code === "gateway_cleanup_pending") ||
      result.failure?.details?.gatewayCleanup === "pending";
    const withCleanup = (value: ReaderPostPresentationV3Result): ReaderPostPresentationV3Result =>
      cleanupPending ? { ...value, cleanupPending: true } : value;
    if (presentationRuntimeFailureDisposition(result) !== undefined) {
      const runtimeFailure = presentationRuntimeFailureIdentity(result);
      return inputs.map(() => withCleanup({ status: "unavailable", reason: "runtime_failure", runtimeFailure }));
    }
    const rejected = runtimePresentationValidationRejection(result, modelBackend);
    if (rejected !== undefined) {
      return inputs.map(() => withCleanup(rejected));
    }
    if (result.status !== "completed") {
      readAgentRuntimeObjectOutput(result, parseObject, "Reader promotion presentation");
    }
    if (modelBackend === mimoReaderSummaryBackend) {
      assertMimoReaderSummaryExecution({ command, result,
        purpose: activeReaderSummaryPurposes.promotionPresentation });
    }
    const rawOutput = readAgentRuntimeObjectOutput(result, parseObject,
      "Reader promotion presentation");
    return completedPromotionPresentationResults({
      rawOutput,
      inputs,
      catalogCandidates,
      sourceCopyWire,
    }).map(withCleanup);
};
