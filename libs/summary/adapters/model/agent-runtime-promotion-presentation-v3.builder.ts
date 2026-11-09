import { readerPostPresentationV3OutputSchema as baseSchema, readerPostPresentationCandidates } from "../../domain/services/reader-post-presentation-v3-proposal";
import { readerPostCanonicalPresentationInstructions } from "./reader-post-canonical-presentation-instructions";
import { mimoQualifiedHeadlineOutputSchema } from "../../domain/services/mimo-qualified-headline-codec";
import {
  READER_POST_PRESENTATION_V3_MAX_REQUEST_BYTES,
  readerPostPresentationV3InputDigest,
  type PromotionPresentationBuilder,
  type ReaderPostPresentationV3Input,
  type ReaderPostPresentationV3Result,
} from "../../domain/services/reader-post-presentation-v3";
import type { AgentRuntimeClientPort, AgentRuntimeProvider, AgentRuntimeTaskCommand } from "../../ports";
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
  activeReaderSummaryProvider,
  mimoReaderSummaryBackend,
  assertMimoReaderSummaryExecution,
  resolveReaderSummaryGenerationIdentity,
  resolveReaderSummaryDailyTaskIdentityFromEnv,
  type ReaderSummaryGenerationBackend,
  activeReaderSummaryPurposes,
  activeReaderSummaryReasoningEffort,
  mimoPresentationReasoningEffort,
  mimoPresentationMaxTimeoutMs,
  assertActiveReaderSummaryProvider,
  isCodexGatewayOnlyReaderSummaryModel,
  isGatewayReaderSummaryBackend,
  readerSummaryRouteControls,
  resolveReaderSummaryBackendEffort,
  resolveReaderSummaryReasoningEffortFromEnv,
} from "./active-reader-summary-generation-profile";
import { presentationRuntimeFailureDisposition, presentationRuntimeFailureIdentity } from
  "./agent-runtime-promotion-presentation-v3-runtime-failure";
import {
  usesSourceCopyOptions,
  mimoPresentationInstructions,
  requestBytes,
  parseObject,
} from "./agent-runtime-promotion-presentation-v3-request";
import {
  runtimePresentationValidationRejection,
  completedPromotionPresentationResults,
} from "./agent-runtime-promotion-presentation-v3-result-policy";


export const defaultPresentationTimeoutMs = 90_000;

export type AgentRuntimePromotionPresentationV3BuilderOptions = {
  readonly client: AgentRuntimeClientPort;
  readonly agentProvider?: AgentRuntimeProvider;
  readonly providerInstanceId?: string;
  readonly model?: string;
  readonly modelBackend?: ReaderSummaryGenerationBackend;
  /** high for gpt-5.6-sol, none for MiMo, the route effort for a gateway route. */
  readonly reasoningEffort?: string;
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
  private readonly modelBackend: ReaderSummaryGenerationBackend;
  private readonly reasoningEffort: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;

  constructor(options: AgentRuntimePromotionPresentationV3BuilderOptions) {
    this.client = options.client;
    this.provider = assertActiveReaderSummaryProvider(options.agentProvider) ??
      activeReaderSummaryProvider;
    this.providerInstanceId = options.providerInstanceId;
    const identity = resolveReaderSummaryGenerationIdentity({
      model: options.model, backend: options.modelBackend,
    });
    this.model = identity.model;
    this.modelBackend = identity.backend;
    const cliEffort = this.modelBackend === mimoReaderSummaryBackend
      ? mimoPresentationReasoningEffort : activeReaderSummaryReasoningEffort;
    // A gateway route, including a gateway-only Codex model, owns its effort.
    if (!isGatewayReaderSummaryBackend(this.modelBackend) &&
      !isCodexGatewayOnlyReaderSummaryModel(this.model) &&
      options.reasoningEffort !== undefined && options.reasoningEffort !== cliEffort) {
      throw new Error("Presentation reasoning effort conflicts with purpose policy");
    }
    this.reasoningEffort = resolveReaderSummaryBackendEffort(
      this.modelBackend, options.reasoningEffort, cliEffort, this.model);
    const configuredTimeoutMs = positiveIntegerOrFallback(options.timeoutMs, defaultPresentationTimeoutMs);
    this.timeoutMs = this.modelBackend === mimoReaderSummaryBackend
      ? Math.min(configuredTimeoutMs, mimoPresentationMaxTimeoutMs) : configuredTimeoutMs;
    this.maxOutputTokens = positiveIntegerOrFallback(options.maxOutputTokens, 2_400);
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
    const first = inputs[0]!;
    const prompt = JSON.stringify({ candidates: inputs.map((input) => ({
      candidateId: input.candidateId, title: input.title, sourceText: input.body,
    })) });
    const catalogCandidates = readerPostPresentationCandidates(prompt);
    const sourceCopyWire = usesSourceCopyOptions(this.modelBackend);
    // Keep Codex's provider-qualified wire schema; narrow copied references per
    // item below, so one invalid sibling does not discard valid presentations.
    const schema = sourceCopyWire ? mimoQualifiedHeadlineOutputSchema(catalogCandidates) : baseSchema;
    const systemPrompt = sourceCopyWire ? mimoPresentationInstructions(catalogCandidates)
      : readerPostCanonicalPresentationInstructions(catalogCandidates);
    const requestDigest = promotionPayloadDigest(canonicalPromotionPayload({
      purpose: activeReaderSummaryPurposes.promotionPresentation,
      inputs: inputs.map(readerPostPresentationV3InputDigest),
      systemPrompt, prompt, outputSchema: schema,
      provider: this.provider, providerInstanceId: this.providerInstanceId ?? null,
      model: this.model, reasoningEffort: this.reasoningEffort,
      ...(this.modelBackend === mimoReaderSummaryBackend ||
        isGatewayReaderSummaryBackend(this.modelBackend) ? { modelBackend: this.modelBackend } : {}),
      maxOutputTokens: this.maxOutputTokens,
    }));
    const command: AgentRuntimeTaskCommand = {
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
      systemPrompt,
      prompt,
      outputSchema: schema,
      controls: {
        interactive: false,
        outputSchemaName: "social_monitor_reader_post_presentation_v3",
        schemaVersion: "reader_post_presentation.v3",
        model: this.model,
        ...(this.modelBackend === mimoReaderSummaryBackend ? { modelBackend: this.modelBackend } : {}),
        ...readerSummaryRouteControls(this.modelBackend, this.reasoningEffort),
        maxOutputTokens: this.maxOutputTokens,
      },
      timeoutMs: this.timeoutMs,
      metadata: { adapter: "agent-runtime-promotion-presentation-v3" },
    };
    let result = await this.client.runTask(command);
    // A transient runtime failure (cancellation, crashed run, empty failure,
    // timeout) says nothing about the stories on either backend: resend the same
    // request once unless it already used its deadline (a runtime that has
    // exhausted this request answers at once), then skip only this batch under
    // its own runtime_failure reason. The promotion run discloses the gap and
    // stops when runtime failures repeat.
    if (presentationRuntimeFailureDisposition(result) === "retry") {
      result = await this.client.runTask(command);
    }
    const cleanupPending = result.warnings.some(warning => warning.code === "gateway_cleanup_pending") ||
      result.failure?.details?.gatewayCleanup === "pending";
    const withCleanup = (value: ReaderPostPresentationV3Result): ReaderPostPresentationV3Result =>
      cleanupPending ? { ...value, cleanupPending: true } : value;
    if (presentationRuntimeFailureDisposition(result) !== undefined) {
      const runtimeFailure = presentationRuntimeFailureIdentity(result);
      return inputs.map(() => withCleanup({ status: "unavailable", reason: "runtime_failure", runtimeFailure }));
    }
    const rejected = runtimePresentationValidationRejection(result, this.modelBackend);
    if (rejected !== undefined) {
      return inputs.map(() => withCleanup(rejected));
    }
    if (result.status !== "completed") {
      readAgentRuntimeObjectOutput(result, parseObject, "Reader promotion presentation");
    }
    if (this.modelBackend === mimoReaderSummaryBackend) {
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
  }
}

export const resolveAgentRuntimePromotionPresentationV3BuilderOptions = (
  env: NodeJS.ProcessEnv,
  client: AgentRuntimeClientPort,
): AgentRuntimePromotionPresentationV3BuilderOptions => {
  const identity = resolveReaderSummaryDailyTaskIdentityFromEnv(env,
    env.AGENT_RUNTIME_READER_SUMMARY_PRESENTATION_MODEL);
  const sharedEffort = resolveReaderSummaryReasoningEffortFromEnv(env);
  return {
    client,
    agentProvider: assertActiveReaderSummaryProvider(env.AGENT_RUNTIME_PROVIDER),
    providerInstanceId: env.AGENT_RUNTIME_PROVIDER_INSTANCE_ID,
    ...identity,
    reasoningEffort: identity.modelBackend === mimoReaderSummaryBackend
      ? mimoPresentationReasoningEffort : sharedEffort,
    timeoutMs: parsePositiveInteger(
      env.AGENT_RUNTIME_READER_SUMMARY_PRESENTATION_TIMEOUT_MS ??
        env.AGENT_RUNTIME_TIMEOUT_MS,
    ),
    maxOutputTokens: parsePositiveInteger(
      env.AGENT_RUNTIME_READER_SUMMARY_PRESENTATION_MAX_OUTPUT_TOKENS,
    ),
  };
};

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
