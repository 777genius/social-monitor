import {
  READER_POST_PRESENTATION_V3_MAX_REQUEST_BYTES,
  type ReaderPostPresentationV3Input,
  type ReaderPostPresentationV3Result,
} from "../../domain/services/reader-post-presentation-v3";
import {
  mimoReaderSummaryBackend,
  type ReaderSummaryGenerationBackend,
} from "./active-reader-summary-generation-profile";
import { requestBytes } from "./agent-runtime-promotion-presentation-v3-request";

/**
 * Keep batch admission and splitting separate from provider command creation.
 * Recursive calls deliberately await their left sibling before dispatching
 * the next: failures must not cause later story requests to run.
 */
export const runAgentRuntimePromotionPresentationBatches = async (
  inputs: readonly ReaderPostPresentationV3Input[],
  modelBackend: ReaderSummaryGenerationBackend,
  execute: (
    batch: readonly ReaderPostPresentationV3Input[],
  ) => Promise<readonly ReaderPostPresentationV3Result[]>,
): Promise<readonly ReaderPostPresentationV3Result[]> => {
  if (inputs.length < 1 || inputs.length > 4) {
    throw new Error("V3 presentation requires a configured batch of 1..4");
  }
  // MiMo attests each item separately, even if one sibling fails.
  if (modelBackend === mimoReaderSummaryBackend && inputs.length > 1) {
    const results: ReaderPostPresentationV3Result[] = [];
    for (const input of inputs) {
      results.push(...await runAgentRuntimePromotionPresentationBatches(
        [input], modelBackend, execute,
      ));
    }
    return results;
  }
  if (requestBytes(inputs) > READER_POST_PRESENTATION_V3_MAX_REQUEST_BYTES) {
    if (inputs.length === 1) {
      return [{ status: "unavailable", reason: "input_over_budget" }];
    }
    const split = Math.ceil(inputs.length / 2);
    return [
      ...await runAgentRuntimePromotionPresentationBatches(inputs.slice(0, split), modelBackend, execute),
      ...await runAgentRuntimePromotionPresentationBatches(inputs.slice(split), modelBackend, execute),
    ];
  }
  return execute(inputs);
};
