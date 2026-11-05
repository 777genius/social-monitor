import type { ReaderDisplayHeadline } from "../../domain";
import {
  READER_POST_PRESENTATION_V3_MAX_REQUEST_BYTES,
  sealReaderPostPresentationV3,
  type PromotionPresentationBuilder,
  type ReaderPostPresentationV3Input,
  type ReaderPostPresentationV3Result,
} from "../../domain/services/reader-post-presentation-v3";
import { promotionPayloadDigest } from
  "../../domain/services/reader-post-promotion-attestation";
import type { OpenAiResponsesReaderSummaryModelAdapterOptions } from
  "./openai-responses-reader-summary-model.adapter";

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

const bindHeadline = (input: ReaderPostPresentationV3Input,
  proposal: Record<string, unknown>): ReaderDisplayHeadline => ({
  status: "accepted",
  kind: proposal.kind as "claim" | "subject_label",
  text: String(proposal.text ?? ""),
  binding: {
    candidateId: input.candidateId, providerKey: input.providerKey,
    tenantId: input.tenantId, workspaceId: input.workspaceId,
    interestId: input.interestId, sourceBindingId: input.sourceBindingId,
    sourceItemId: input.sourceItemId, trustedIntent: input.trustedIntent,
    availability: input.body.trim() ? "body_present" : "title_only",
    reviewedInputDigest: promotionPayloadDigest(JSON.stringify({
      candidateId: input.candidateId, providerKey: input.providerKey,
      context: { tenantId: input.tenantId, workspaceId: input.workspaceId,
        interestId: input.interestId, sourceBindingId: input.sourceBindingId,
        sourceItemId: input.sourceItemId, trustedIntent: input.trustedIntent,
        availability: input.body.trim() ? "body_present" : "title_only" },
      title: input.title, body: input.body,
    })),
  },
  support: proposal.support as never,
  qualifications: proposal.qualifications as never,
  confidence: Number(proposal.confidence),
  wholeInput: { titleLength: input.title.length, bodyLength: input.body.length,
    qualificationJudgment: proposal.qualificationJudgment as
      "none" | "preserved" | "subject_only" },
});

const presentationInstructions = `Create a short reader headline for every candidate using only its exact title and sourceText. Preserve every material qualification. Return unavailable when support is insufficient. Evidence offsets are JavaScript UTF-16 offsets into title or the complete sourceText, named bodyPreview. Never use outside knowledge, popularity, prior scores, or candidate order.`;
const reference = { type: "object", additionalProperties: false,
  required: ["field", "start", "end", "quote"], properties: {
    field: { type: "string", enum: ["title", "bodyPreview"] },
    start: { type: "integer", minimum: 0 }, end: { type: "integer", minimum: 1 },
    quote: { type: "string", minLength: 1, maxLength: 256 } } };
const presentationSchema = { type: "object", additionalProperties: false,
  required: ["presentations"], properties: { presentations: { type: "array",
    minItems: 1, maxItems: 4, items: { type: "object", additionalProperties: false,
      required: ["candidateId", "status", "kind", "text", "support",
        "qualifications", "confidence", "qualificationJudgment"], properties: {
        candidateId: { type: "string" }, status: { type: "string",
          enum: ["available", "unavailable"] }, kind: { type: "string",
          enum: ["claim", "subject_label"] }, text: { type: "string", maxLength: 119 },
        support: { type: "array", maxItems: 8, items: reference },
        qualifications: { type: "array", maxItems: 8, items: { type: "object",
          additionalProperties: false, required: ["phrase", "evidence"], properties: {
            phrase: { type: "string", maxLength: 119 }, evidence: { type: "array",
              minItems: 1, maxItems: 8, items: reference } } } },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        qualificationJudgment: { type: "string",
          enum: ["none", "preserved", "subject_only"] } } } } } };

const record = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("V3 presentation item is invalid");
  }
  return value as Record<string, unknown>;
};

const validatedPresentationBatch = (
  value: unknown,
  inputs: readonly ReaderPostPresentationV3Input[],
): ReadonlyMap<string, Record<string, unknown>> => {
  if (!Array.isArray(value) || value.length !== inputs.length) {
    throw new Error("V3 presentation returned an invalid batch");
  }
  const requested = new Set(inputs.map((input) => input.candidateId));
  const proposals = new Map<string, Record<string, unknown>>();
  for (const item of value) {
    const proposal = record(item);
    assertPresentationShape(proposal);
    const candidateId = proposal.candidateId as string;
    if (!requested.has(candidateId) || proposals.has(candidateId)) {
      throw new Error("V3 presentation returned an invalid candidate identity");
    }
    proposals.set(candidateId, proposal);
  }
  if (proposals.size !== requested.size ||
      [...requested].some((candidateId) => !proposals.has(candidateId))) {
    throw new Error("V3 presentation returned an incomplete candidate batch");
  }
  return proposals;
};

const validatedPresentationRoot = (
  value: unknown,
  inputs: readonly ReaderPostPresentationV3Input[],
): ReadonlyMap<string, Record<string, unknown>> => {
  const root = record(value);
  const keys = Object.keys(root);
  if (keys.length !== 1 || keys[0] !== "presentations") {
    throw new Error("V3 presentation response root violates the response contract");
  }
  return validatedPresentationBatch(root.presentations, inputs);
};

const assertPresentationShape = (proposal: Record<string, unknown>): void => {
  const keys = Object.keys(proposal).sort();
  const expected = ["candidateId", "confidence", "kind", "qualificationJudgment",
    "qualifications", "status", "support", "text"].sort();
  const validScalar = typeof proposal.candidateId === "string" &&
    (proposal.status === "available" || proposal.status === "unavailable") &&
    (proposal.kind === "claim" || proposal.kind === "subject_label") &&
    typeof proposal.text === "string" && proposal.text.length <= 119 &&
    typeof proposal.confidence === "number" && Number.isFinite(proposal.confidence) &&
    proposal.confidence >= 0 && proposal.confidence <= 1 &&
    ["none", "preserved", "subject_only"].includes(
      proposal.qualificationJudgment as string);
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index]) ||
      !validScalar || !validReferences(proposal.support) ||
      !Array.isArray(proposal.qualifications) || proposal.qualifications.length > 8 ||
      !proposal.qualifications.every(validQualification)) {
    throw new Error("V3 presentation item violates the response contract");
  }
};

const validQualification = (value: unknown): boolean => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).sort().join(",") === "evidence,phrase" &&
    typeof item.phrase === "string" && item.phrase.length <= 119 &&
    validReferences(item.evidence, true);
};

const validReferences = (value: unknown, nonEmpty = false): boolean =>
  Array.isArray(value) && value.length <= 8 && (!nonEmpty || value.length > 0) &&
  value.every((reference) => {
    if (reference === null || typeof reference !== "object" ||
        Array.isArray(reference)) return false;
    const item = reference as Record<string, unknown>;
    return Object.keys(item).sort().join(",") === "end,field,quote,start" &&
      (item.field === "title" || item.field === "bodyPreview") &&
      Number.isSafeInteger(item.start) && Number.isSafeInteger(item.end) &&
      (item.start as number) >= 0 && (item.end as number) >= 1 &&
      typeof item.quote === "string" && item.quote.length > 0 && item.quote.length <= 256;
  });

const boundedResponseText = async (response: Response): Promise<string> => {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("V3 presentation response is missing");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 256 * 1024) {
        await reader.cancel();
        throw new Error("V3 presentation response exceeds 256 KiB");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
};
const outputText = (payload: Record<string, unknown>): string => {
  if (payload.status !== "completed" || !Array.isArray(payload.output)) {
    throw new Error("V3 presentation did not complete");
  }
  for (const item of payload.output) {
    const message = record(item);
    if (message.type !== "message" || !Array.isArray(message.content)) continue;
    for (const content of message.content) {
      const value = record(content);
      if (value.type === "output_text" && typeof value.text === "string") return value.text;
    }
  }
  throw new Error("V3 presentation output is missing");
};
