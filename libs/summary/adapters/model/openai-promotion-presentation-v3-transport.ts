import type { ReaderPostPresentationV3Input } from "../../domain/services/reader-post-presentation-v3";
import { presentationInstructions, presentationSchema } from "./openai-promotion-presentation-v3-schema";
import { validatedPresentationRoot } from "./openai-promotion-presentation-v3-response-contract";
import { boundedResponseText, outputText } from "./openai-promotion-presentation-v3-response-codec";

type PresentationV3Fetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Owns the exact provider wire representation. The builder decides when a
 * request is within budget, before this encoded body can leave the process.
 */
export const buildOpenAiPresentationV3RequestBody = (
  inputs: readonly ReaderPostPresentationV3Input[],
  model: string,
): string => {
  const wire = inputs.map((input) => ({ candidateId: input.candidateId,
    title: input.title, sourceText: input.body }));
  return JSON.stringify({ model, store: false,
    max_output_tokens: 2_400,
    instructions: presentationInstructions,
    input: JSON.stringify({ candidates: wire }),
    text: { format: { type: "json_schema", name: "reader_post_presentation_v3",
      strict: true, schema: presentationSchema } } });
};

/**
 * Transport and untrusted envelope decoding stay outside the orchestration
 * and sealed-domain-result path. No response can bypass the strict batch
 * identity/shape validator.
 */
export const fetchOpenAiPresentationV3Proposals = async (params: {
  readonly inputs: readonly ReaderPostPresentationV3Input[];
  readonly requestBody: string;
  readonly apiKey: string;
  readonly endpoint: string;
  readonly fetchFn: PresentationV3Fetch;
}): Promise<ReadonlyMap<string, Record<string, unknown>>> => {
  const response = await params.fetchFn(params.endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${params.apiKey.trim()}`,
      "content-type": "application/json" },
    signal: AbortSignal.timeout(45_000),
    body: params.requestBody,
  });
  if (!response.ok) throw new Error(`V3 presentation failed with HTTP ${response.status}`);
  const payload = JSON.parse(await boundedResponseText(response)) as Record<string, unknown>;
  const text = outputText(payload);
  const parsed: unknown = JSON.parse(text);
  return validatedPresentationRoot(parsed, params.inputs);
};
