import {
  READER_POST_PRESENTATION_V3_MAX_REQUEST_BYTES,
  type PromotionPresentationBuilder,
  type ReaderPostPresentationV3Input,
  type ReaderPostPresentationV3Result,
} from "../../domain/services/reader-post-presentation-v3";
import type { AgentRuntimeClientPort } from "../../ports";
import {
  activeReaderSummaryProvider,
  mimoReaderSummaryBackend,
  type ReaderSummaryGenerationBackend,
} from "./active-reader-summary-generation-profile";
import {
  resolvePromotionPresentationV3RuntimeOptions,
  type AgentRuntimePromotionPresentationV3BuilderOptions,
} from "./agent-runtime-promotion-presentation-v3-options";
import { requestBytes } from "./agent-runtime-promotion-presentation-v3-request";
import { executeAgentRuntimePromotionPresentation } from "./agent-runtime-promotion-presentation-v3-execution";
import { createPromotionPresentationTaskCommand } from "./agent-runtime-promotion-presentation-v3-task-command";


export {
  defaultPresentationTimeoutMs,
  resolveAgentRuntimePromotionPresentationV3BuilderOptions,
  type AgentRuntimePromotionPresentationV3BuilderOptions,
} from "./agent-runtime-promotion-presentation-v3-options";

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
  private readonly modelBackend: ReaderSummaryGenerationBackend;
  private readonly reasoningEffort: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;

  constructor(options: AgentRuntimePromotionPresentationV3BuilderOptions) {
    const runtime = resolvePromotionPresentationV3RuntimeOptions(options);
    this.client = runtime.client;
    this.provider = runtime.provider;
    this.providerInstanceId = runtime.providerInstanceId;
    this.model = runtime.model;
    this.modelBackend = runtime.modelBackend;
    this.reasoningEffort = runtime.reasoningEffort;
    this.timeoutMs = runtime.timeoutMs;
    this.maxOutputTokens = runtime.maxOutputTokens;
  }

  async build(inputs: readonly ReaderPostPresentationV3Input[]):
  Promise<readonly ReaderPostPresentationV3Result[]> {
    if (inputs.length < 1 || inputs.length > 4) {
      throw new Error("V3 presentation requires a configured batch of 1..4");
    }
    // Each MiMo completion attests one story, so a malformed sibling cannot
    // discard independently valid stories. Rejected outputs remain unread.
    if (this.modelBackend === mimoReaderSummaryBackend && inputs.length > 1) {
      const results: ReaderPostPresentationV3Result[] = [];
      for (const input of inputs) results.push(...await this.build([input]));
      return results;
    }
    if (requestBytes(inputs) > READER_POST_PRESENTATION_V3_MAX_REQUEST_BYTES) {
      if (inputs.length === 1) {
        return [{ status: "unavailable", reason: "input_over_budget" }];
      }
      const split = Math.ceil(inputs.length / 2);
      return [...await this.build(inputs.slice(0, split)),
        ...await this.build(inputs.slice(split))];
    }
    const { command, sourceCopyWire, catalogCandidates } =
      createPromotionPresentationTaskCommand(inputs, {
        provider: this.provider,
        providerInstanceId: this.providerInstanceId,
        model: this.model,
        modelBackend: this.modelBackend,
        reasoningEffort: this.reasoningEffort,
        timeoutMs: this.timeoutMs,
        maxOutputTokens: this.maxOutputTokens,
      });
    return executeAgentRuntimePromotionPresentation({
      client: this.client,
      command,
      inputs,
      catalogCandidates,
      sourceCopyWire,
      modelBackend: this.modelBackend,
    });
  }
}



/**
 * Codex is the only backend qualified on the canonical wire, where the model
 * copies source references and supplies its own qualification judgment and text
 * that literally contains every qualification. Every Codex model keeps it,
 * gateway-only ones included, so Codex keeps its canonical fields. MiMo and
 * the gateway-only backends miss those (off-by-one ends, entity-escaped
 * quotes, paraphrased phrases) and fail the seal, so they copy
 * machine-computed source references and the server composes the text and
 * judgment.
 */
