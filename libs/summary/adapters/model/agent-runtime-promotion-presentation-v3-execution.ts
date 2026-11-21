import type {
  ReaderPostPresentationV3Input,
  ReaderPostPresentationV3Result,
} from "../../domain/services/reader-post-presentation-v3";
import type { AgentRuntimeClientPort } from "../../ports";
import { readAgentRuntimeObjectOutput } from "./agent-runtime-model-support";
import { mimoReaderSummaryBackend, activeReaderSummaryPurposes } from "./reader-summary-runtime-contract";
import { assertMimoReaderSummaryExecution } from "./reader-summary-mimo-execution-admission";
import type { ReaderSummaryGenerationBackend } from "./reader-summary-gateway-route-policy";
import { projectPromotionPresentationCleanup } from "./agent-runtime-promotion-presentation-v3-cleanup-policy";
import { presentationRuntimeFailureDisposition } from "./agent-runtime-promotion-presentation-v3-runtime-failure";
import { presentationRuntimeFailureIdentity } from "./agent-runtime-promotion-presentation-v3-runtime-failure-identity";
import { parseObject } from "./agent-runtime-promotion-presentation-v3-output-object";
import type { createPromotionPresentationTaskCommand } from "./agent-runtime-promotion-presentation-v3-task-command";
import { runtimePresentationValidationRejection } from "./agent-runtime-promotion-presentation-v3-runtime-output-rejection";
import { completedPromotionPresentationResults } from "./agent-runtime-promotion-presentation-v3-result-policy";
import { runPromotionPresentationTaskAttempts } from "./agent-runtime-promotion-presentation-v3-task-attempts";

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
    const result = await runPromotionPresentationTaskAttempts(client, command);
    const withCleanup = projectPromotionPresentationCleanup(result);
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
