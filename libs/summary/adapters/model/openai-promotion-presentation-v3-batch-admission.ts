import {
  READER_POST_PRESENTATION_V3_MAX_REQUEST_BYTES,
  type ReaderPostPresentationV3Input,
  type ReaderPostPresentationV3Result,
} from "../../domain/services/reader-post-presentation-v3";
import { buildOpenAiPresentationV3RequestBody } from "./openai-promotion-presentation-v3-transport";

/**
 * Encoded-request admission is independent of provider dispatch and sealing.
 * The caller keeps the same ordered recursive build path for split batches.
 */
export const dispatchOpenAiPromotionPresentationBatch = async (params: {
  readonly inputs: readonly ReaderPostPresentationV3Input[];
  readonly model: string;
  readonly buildSubset: (
    inputs: readonly ReaderPostPresentationV3Input[],
  ) => Promise<readonly ReaderPostPresentationV3Result[]>;
  readonly executeWithinBudget: (
    inputs: readonly ReaderPostPresentationV3Input[],
    requestBody: string,
  ) => Promise<readonly ReaderPostPresentationV3Result[]>;
}): Promise<readonly ReaderPostPresentationV3Result[]> => {
  const { inputs } = params;
  const requestBody = buildOpenAiPresentationV3RequestBody(inputs, params.model);
  if (Buffer.byteLength(requestBody, "utf8") >
      READER_POST_PRESENTATION_V3_MAX_REQUEST_BYTES) {
    if (inputs.length === 1) {
      return [{ status: "unavailable", reason: "input_over_budget" }];
    }
    const split = Math.ceil(inputs.length / 2);
    return [
      ...await params.buildSubset(inputs.slice(0, split)),
      ...await params.buildSubset(inputs.slice(split)),
    ];
  }
  return params.executeWithinBudget(inputs, requestBody);
};
