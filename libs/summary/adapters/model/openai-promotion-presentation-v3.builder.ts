import {
  READER_POST_PRESENTATION_V3_MAX_REQUEST_BYTES,
  sealReaderPostPresentationV3,
  type PromotionPresentationBuilder,
  type ReaderPostPresentationV3Input,
  type ReaderPostPresentationV3Result,
} from "../../domain/services/reader-post-presentation-v3";
import type { OpenAiResponsesReaderSummaryModelAdapterOptions } from "./openai-responses-reader-summary-model.adapter";
import { bindHeadline } from "./openai-promotion-presentation-v3-headline";
import {
  buildOpenAiPresentationV3RequestBody,
  fetchOpenAiPresentationV3Proposals,
} from "./openai-promotion-presentation-v3-transport";

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
    const requestBody = buildOpenAiPresentationV3RequestBody(inputs, this.model);
    if (Buffer.byteLength(requestBody, "utf8") >
        READER_POST_PRESENTATION_V3_MAX_REQUEST_BYTES) {
      if (inputs.length === 1) {
        return [{ status: "unavailable", reason: "input_over_budget" }];
      }
      const split = Math.ceil(inputs.length / 2);
      return [
        ...await this.build(inputs.slice(0, split)),
        ...await this.build(inputs.slice(split)),
      ];
    }
    const proposals = await fetchOpenAiPresentationV3Proposals({
      inputs,
      requestBody,
      apiKey: this.apiKey,
      endpoint: this.endpoint,
      fetchFn: this.fetchFn,
    });
    return inputs.map((input) => {
      const proposal = proposals.get(input.candidateId)!;
      if (proposal.status === "unavailable") {
        return { status: "unavailable", reason: "insufficient_support" };
      }
      const headline = bindHeadline(input, proposal);
      return sealReaderPostPresentationV3({ input, headline });
    });
  }
}
