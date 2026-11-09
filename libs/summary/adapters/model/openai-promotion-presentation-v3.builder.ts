import {
  READER_POST_PRESENTATION_V3_MAX_REQUEST_BYTES,
  sealReaderPostPresentationV3,
  type PromotionPresentationBuilder,
  type ReaderPostPresentationV3Input,
  type ReaderPostPresentationV3Result,
} from "../../domain/services/reader-post-presentation-v3";
import type { OpenAiResponsesReaderSummaryModelAdapterOptions } from "./openai-responses-reader-summary-model.adapter";
import { bindHeadline } from "./openai-promotion-presentation-v3-headline";
import { presentationInstructions, presentationSchema } from "./openai-promotion-presentation-v3-schema";
import { validatedPresentationRoot } from "./openai-promotion-presentation-v3-response-contract";
import { boundedResponseText, outputText } from "./openai-promotion-presentation-v3-response-codec";

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
    const wire = inputs.map((input) => ({ candidateId: input.candidateId,
      title: input.title, sourceText: input.body }));
    const requestBody = JSON.stringify({ model: this.model, store: false,
      max_output_tokens: 2_400,
      instructions: presentationInstructions,
      input: JSON.stringify({ candidates: wire }),
      text: { format: { type: "json_schema", name: "reader_post_presentation_v3",
        strict: true, schema: presentationSchema } } });
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
    const response = await this.fetchFn(this.endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey.trim()}`,
        "content-type": "application/json" },
      signal: AbortSignal.timeout(45_000),
      body: requestBody,
    });
    if (!response.ok) throw new Error(`V3 presentation failed with HTTP ${response.status}`);
    const payload = JSON.parse(await boundedResponseText(response)) as Record<string, unknown>;
    const text = outputText(payload);
    const parsed: unknown = JSON.parse(text);
    const proposals = validatedPresentationRoot(parsed, inputs);
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
