import {
  type PromotionPresentationBuilder,
  type ReaderPostPresentationV3Input,
  type ReaderPostPresentationV3Result,
} from "../../domain/services/reader-post-presentation-v3";
import type { OpenAiResponsesReaderSummaryModelAdapterOptions } from "./openai-responses-reader-summary-model.adapter";
import { fetchOpenAiPresentationV3Proposals } from "./openai-promotion-presentation-v3-transport";
import { dispatchOpenAiPromotionPresentationBatch } from "./openai-promotion-presentation-v3-batch-admission";
import { sealOpenAiPromotionPresentationV3Proposals } from "./openai-promotion-presentation-v3-result-policy";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class OpenAiPromotionPresentationV3Builder
implements PromotionPresentationBuilder {
  constructor(
    options: OpenAiResponsesReaderSummaryModelAdapterOptions,
  ) {
    this.apiKey = options.apiKey?.trim() ?? "";
    this.fetchFn = options.fetchFn ?? fetch;
    this.endpoint = options.endpointUrl?.trim() || "https://api.openai.com/v1/responses";
    this.model = options.model?.trim() || "gpt-5.4-mini";
  }

  private readonly apiKey: string;
  private readonly fetchFn: FetchLike;
  private readonly endpoint: string;
  private readonly model: string;

  async build(inputs: readonly ReaderPostPresentationV3Input[]):
  Promise<readonly ReaderPostPresentationV3Result[]> {
    if (inputs.length < 1 || inputs.length > 4 || !this.apiKey.trim()) {
      throw new Error("V3 presentation requires a configured batch of 1..4");
    }
    return dispatchOpenAiPromotionPresentationBatch({
      inputs,
      model: this.model,
      buildSubset: (subset) => this.build(subset),
      executeWithinBudget: async (subset, requestBody) => {
        const proposals = await fetchOpenAiPresentationV3Proposals({
          inputs: subset,
          requestBody,
          apiKey: this.apiKey,
          endpoint: this.endpoint,
          fetchFn: this.fetchFn,
        });
        return sealOpenAiPromotionPresentationV3Proposals(subset, proposals);
      },
    });
  }
}
