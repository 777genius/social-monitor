import type { ReaderDisplayHeadline } from "../../domain";
import {
  READER_POST_PRESENTATION_V3_MAX_REQUEST_BYTES,
  readerPostPresentationV3InputDigest,
  sealReaderPostPresentationV3,
  type PromotionPresentationBuilder,
  type ReaderPostPresentationV3Input,
  type ReaderPostPresentationV3Result,
} from "../../domain/services/reader-post-presentation-v3";
import type { AgentRuntimeClientPort, AgentRuntimeProvider } from "../../ports";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { canonicalPromotionPayload, promotionPayloadDigest } from
  "../../domain/services/reader-post-promotion-attestation";
import {
  buildAgentRuntimeRequestId,
  parsePositiveInteger,
  positiveIntegerOrFallback,
  readAgentRuntimeObjectOutput,
} from "./agent-runtime-model-support";
import {
  activeReaderSummaryModel,
  activeReaderSummaryProvider,
  activeReaderSummaryPurposes,
  activeReaderSummaryReasoningEffort,
  assertActiveReaderSummaryProvider,
  parseActiveReaderSummaryModel,
  parseActiveReaderSummaryReasoningEffort,
} from "./active-reader-summary-generation-profile";

export type AgentRuntimePromotionPresentationV3BuilderOptions = {
  readonly client: AgentRuntimeClientPort;
  readonly agentProvider?: AgentRuntimeProvider;
  readonly providerInstanceId?: string;
  readonly model?: string;
  readonly reasoningEffort?: "high";
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
};

/**
 * The presentation capability is intentionally routed through the existing
 * agent-runtime boundary. The summary context owns provider selection and
 * credentials; this adapter only owns the V3 request and response contract.
 */
export class AgentRuntimePromotionPresentationV3Builder
implements PromotionPresentationBuilder {
  private readonly client: AgentRuntimeClientPort;
  private readonly provider: typeof activeReaderSummaryProvider;
  private readonly providerInstanceId?: string;
  private readonly model: string;
  private readonly reasoningEffort: "high";
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;

  constructor(options: AgentRuntimePromotionPresentationV3BuilderOptions) {
    this.client = options.client;
    this.provider = assertActiveReaderSummaryProvider(options.agentProvider) ??
      activeReaderSummaryProvider;
    this.providerInstanceId = options.providerInstanceId;
    this.model = parseActiveReaderSummaryModel(options.model) ??
      activeReaderSummaryModel;
    this.reasoningEffort = options.reasoningEffort ??
      activeReaderSummaryReasoningEffort;
    this.timeoutMs = positiveIntegerOrFallback(options.timeoutMs, 90_000);
    this.maxOutputTokens = positiveIntegerOrFallback(options.maxOutputTokens, 2_400);
  }

  async build(inputs: readonly ReaderPostPresentationV3Input[]):
  Promise<readonly ReaderPostPresentationV3Result[]> {
    if (inputs.length < 1 || inputs.length > 4) {
      throw new Error("V3 presentation requires a configured batch of 1..4");
    }
    if (requestBytes(inputs) > READER_POST_PRESENTATION_V3_MAX_REQUEST_BYTES) {
      if (inputs.length === 1) {
        return [{ status: "unavailable", reason: "input_over_budget" }];
      }
      const split = Math.ceil(inputs.length / 2);
      return [...await this.build(inputs.slice(0, split)),
        ...await this.build(inputs.slice(split))];
    }
    const first = inputs[0]!;
    const prompt = JSON.stringify({ candidates: inputs.map((input) => ({
      candidateId: input.candidateId, title: input.title, sourceText: input.body,
    })) });
    const requestDigest = promotionPayloadDigest(canonicalPromotionPayload({
      purpose: activeReaderSummaryPurposes.promotionPresentation,
      inputs: inputs.map(readerPostPresentationV3InputDigest),
      systemPrompt: instructions, prompt, outputSchema: schema,
      provider: this.provider, providerInstanceId: this.providerInstanceId ?? null,
      model: this.model, reasoningEffort: this.reasoningEffort,
      maxOutputTokens: this.maxOutputTokens,
    }));
    const result = await this.client.runTask({
      requestId: buildAgentRuntimeRequestId(
        "reader-summary-promotion-presentation", first.tenantId,
        first.workspaceId, requestDigest, new Date(0),
      ),
      tenantId: tenantId(first.tenantId),
      workspaceId: workspaceId(first.workspaceId),
      correlationId: buildAgentRuntimeRequestId(
        "reader-summary-promotion-presentation-correlation", first.tenantId,
        first.workspaceId, requestDigest, new Date(0),
      ),
      provider: this.provider,
      providerInstanceId: this.providerInstanceId,
      purpose: activeReaderSummaryPurposes.promotionPresentation,
      systemPrompt: instructions,
      prompt,
      outputSchema: schema,
      controls: {
        interactive: false,
        outputSchemaName: "social_monitor_reader_post_presentation_v3",
        schemaVersion: "reader_post_presentation.v3",
        model: this.model,
        reasoningEffort: this.reasoningEffort,
        maxOutputTokens: this.maxOutputTokens,
      },
      timeoutMs: this.timeoutMs,
      metadata: { adapter: "agent-runtime-promotion-presentation-v3" },
    });
    const output = readAgentRuntimeObjectOutput(result, parseObject,
      "Reader promotion presentation");
    const proposals = validateBatch(output.presentations, inputs);
    return inputs.map((input) => {
      const proposal = proposals.get(input.candidateId)!;
      if (proposal.status === "unavailable") {
        return { status: "unavailable", reason: "insufficient_support" };
      }
      return sealReaderPostPresentationV3({ input, headline: bind(input, proposal) });
    });
  }
}

export const resolveAgentRuntimePromotionPresentationV3BuilderOptions = (
  env: NodeJS.ProcessEnv,
  client: AgentRuntimeClientPort,
): AgentRuntimePromotionPresentationV3BuilderOptions => ({
  client,
  agentProvider: assertActiveReaderSummaryProvider(env.AGENT_RUNTIME_PROVIDER),
  providerInstanceId: env.AGENT_RUNTIME_PROVIDER_INSTANCE_ID,
  model: parseActiveReaderSummaryModel(env.AGENT_RUNTIME_READER_SUMMARY_MODEL),
  reasoningEffort: parseActiveReaderSummaryReasoningEffort(
    env.AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT ??
      env.AGENT_RUNTIME_REASONING_EFFORT,
  ),
  timeoutMs: parsePositiveInteger(
    env.AGENT_RUNTIME_READER_SUMMARY_PRESENTATION_TIMEOUT_MS ??
      env.AGENT_RUNTIME_TIMEOUT_MS,
  ),
  maxOutputTokens: parsePositiveInteger(
    env.AGENT_RUNTIME_READER_SUMMARY_PRESENTATION_MAX_OUTPUT_TOKENS,
  ),
});

const instructions = "Create a short reader headline for every candidate using only its exact title and sourceText. Preserve every material qualification. Return unavailable when support is insufficient. Evidence offsets are JavaScript UTF-16 offsets into title or complete sourceText, named bodyPreview. Never use outside knowledge, popularity, prior scores, or candidate order.";
const reference = { type: "object", additionalProperties: false,
  required: ["field", "start", "end", "quote"], properties: {
    field: { type: "string", enum: ["title", "bodyPreview"] },
    start: { type: "integer", minimum: 0 }, end: { type: "integer", minimum: 1 },
    quote: { type: "string", minLength: 1, maxLength: 256 } } };
const schema = { type: "object", additionalProperties: false,
  required: ["presentations"], properties: { presentations: { type: "array",
    minItems: 1, maxItems: 4, items: { type: "object", additionalProperties: false,
      required: ["candidateId", "status", "kind", "text", "support", "qualifications", "confidence", "qualificationJudgment"], properties: {
        candidateId: { type: "string" }, status: { type: "string", enum: ["available", "unavailable"] },
        kind: { type: "string", enum: ["claim", "subject_label"] }, text: { type: "string", maxLength: 119 },
        support: { type: "array", maxItems: 8, items: reference }, qualifications: { type: "array", maxItems: 8,
          items: { type: "object", additionalProperties: false, required: ["phrase", "evidence"], properties: {
            phrase: { type: "string", maxLength: 119 }, evidence: { type: "array", minItems: 1, maxItems: 8, items: reference } } } },
        confidence: { type: "number", minimum: 0, maximum: 1 }, qualificationJudgment: { type: "string", enum: ["none", "preserved", "subject_only"] } } } } } };

const requestBytes = (inputs: readonly ReaderPostPresentationV3Input[]): number =>
  Buffer.byteLength(JSON.stringify({ candidates: inputs.map((input) => ({
    candidateId: input.candidateId, title: input.title, sourceText: input.body,
  })) }), "utf8");

const parseObject = (value: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(value);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Reader promotion presentation output is invalid");
  }
  return parsed as Record<string, unknown>;
};

const validateBatch = (value: unknown, inputs: readonly ReaderPostPresentationV3Input[]) => {
  if (!Array.isArray(value) || value.length !== inputs.length) {
    throw new Error("Reader promotion presentation returned an invalid batch");
  }
  const requested = new Set(inputs.map((input) => input.candidateId));
  const result = new Map<string, Record<string, unknown>>();
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Reader promotion presentation item is invalid");
    }
    const proposal = item as Record<string, unknown>;
    const id = proposal.candidateId;
    if (typeof id !== "string" || !requested.has(id) || result.has(id) ||
        !validProposal(proposal)) {
      throw new Error("Reader promotion presentation response violates its contract");
    }
    result.set(id, proposal);
  }
  return result;
};

const validProposal = (value: Record<string, unknown>): boolean =>
  Object.keys(value).sort().join(",") ===
    "candidateId,confidence,kind,qualificationJudgment,qualifications,status,support,text" &&
  (value.status === "available" || value.status === "unavailable") &&
  (value.kind === "claim" || value.kind === "subject_label") &&
  typeof value.text === "string" && value.text.length <= 119 &&
  typeof value.confidence === "number" && Number.isFinite(value.confidence) &&
  value.confidence >= 0 && value.confidence <= 1 &&
  ["none", "preserved", "subject_only"].includes(value.qualificationJudgment as string) &&
  validReferences(value.support) && Array.isArray(value.qualifications) &&
  value.qualifications.length <= 8 && value.qualifications.every(validQualification);

const validQualification = (value: unknown): boolean => value !== null &&
  typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join(",") === "evidence,phrase" &&
  typeof (value as Record<string, unknown>).phrase === "string" &&
  validReferences((value as Record<string, unknown>).evidence, true);

const validReferences = (value: unknown, nonEmpty = false): boolean =>
  Array.isArray(value) && value.length <= 8 && (!nonEmpty || value.length > 0) &&
  value.every((reference) => reference !== null && typeof reference === "object" &&
    !Array.isArray(reference) && Object.keys(reference).sort().join(",") ===
      "end,field,quote,start" && ((reference as Record<string, unknown>).field === "title" ||
      (reference as Record<string, unknown>).field === "bodyPreview") &&
    Number.isSafeInteger((reference as Record<string, unknown>).start) &&
    Number.isSafeInteger((reference as Record<string, unknown>).end) &&
    typeof (reference as Record<string, unknown>).quote === "string");

const bind = (input: ReaderPostPresentationV3Input,
  proposal: Record<string, unknown>): ReaderDisplayHeadline => ({
  status: "accepted", kind: proposal.kind as "claim" | "subject_label",
  text: proposal.text as string,
  binding: { candidateId: input.candidateId, providerKey: input.providerKey,
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
    })) }, support: proposal.support as never,
  qualifications: proposal.qualifications as never,
  confidence: proposal.confidence as number,
  wholeInput: { titleLength: input.title.length, bodyLength: input.body.length,
    qualificationJudgment: proposal.qualificationJudgment as "none" | "preserved" | "subject_only" },
});
