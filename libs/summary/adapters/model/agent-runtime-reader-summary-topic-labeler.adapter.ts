import { buildAgentRuntimeTopicLabelCommand } from "./agent-runtime-reader-summary-topic-label-command";
import { assertMimoTopicLabelSchema } from "./agent-runtime-reader-summary-topic-label-schema";
import {
  READER_SUMMARY_TOPIC_MAP_MAX_NODES,
  type ReaderSummaryTopicLabelPlan,
} from "../../domain";
import type {
  AgentRuntimeClientPort,
  ReaderSummaryTopicLabelerInput,
  ReaderSummaryTopicLabelerPort,
  ReaderSummaryTopicMapAttemptContext,
} from "../../ports";
import {
  nonEmptyOrFallback,
  positiveIntegerOrFallback,
  readAgentRuntimeObjectOutput,
} from "./agent-runtime-model-support";
import {
  normalizeAgentRuntimeReaderSummaryTopicLabelPlan,
  parseAgentRuntimeReaderSummaryTopicLabelerJsonObject,
} from "./agent-runtime-reader-summary-topic-label-plan-normalizer";
import { selectAgentRuntimeReaderSummaryTopicCandidates } from "./agent-runtime-reader-summary-topic-labeler-prompt";
import {
  verifyAndRecordReaderSummaryExecution,
  type VerifiedReaderSummaryExecutionAttestationSink,
} from "./reader-summary-execution-attestation";
import {
  activeReaderSummaryModel,
  activeReaderSummaryProvider,
  activeReaderSummaryReasoningEffort,
  assertReaderSummaryBackendModel,
  mimoReaderSummaryBackend,
  resolveReaderSummaryBackendEffort,
  type ReaderSummaryGenerationBackend,
  verifyAndRecordMimoDailyExecution,
} from "./active-reader-summary-generation-profile";

export type AgentRuntimeReaderSummaryTopicLabelerOptions = {
  readonly client: AgentRuntimeClientPort;
  readonly agentProvider?: typeof activeReaderSummaryProvider;
  readonly providerInstanceId?: string;
  readonly model?: string;
  readonly modelBackend?: ReaderSummaryGenerationBackend;
  /** high for Codex and MiMo, the route effort for a gateway backend. */
  readonly reasoningEffort?: string;
  readonly promptVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly maxCandidates?: number;
  readonly verifiedAttestationSink?: VerifiedReaderSummaryExecutionAttestationSink;
};

const defaultAgentProvider = activeReaderSummaryProvider;
const defaultModel = activeReaderSummaryModel;
const defaultPromptVersion = "reader_summary.topic_map.agent_runtime.v21";
export const defaultTimeoutMs = 600_000;
const defaultMaxOutputTokens = 6_000;
const defaultMaxCandidates = 30;

export class AgentRuntimeReaderSummaryTopicLabeler implements ReaderSummaryTopicLabelerPort {
  private readonly client: AgentRuntimeClientPort;
  private readonly agentProvider: typeof activeReaderSummaryProvider;
  private readonly providerInstanceId?: string;
  private readonly model: string;
  private readonly modelBackend: ReaderSummaryGenerationBackend;
  private readonly reasoningEffort: string;
  private readonly promptVersion: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly maxCandidates: number;
  private readonly verifiedAttestationSink?: VerifiedReaderSummaryExecutionAttestationSink;

  constructor(options: AgentRuntimeReaderSummaryTopicLabelerOptions) {
    this.client = options.client;
    this.agentProvider = options.agentProvider ?? defaultAgentProvider;
    this.providerInstanceId = options.providerInstanceId;
    this.model = options.model ?? defaultModel;
    this.modelBackend = options.modelBackend ?? "openai-chatgpt";
    assertReaderSummaryBackendModel(this.modelBackend, this.model);
    this.reasoningEffort = resolveReaderSummaryBackendEffort(
      this.modelBackend, options.reasoningEffort, activeReaderSummaryReasoningEffort, this.model);
    this.promptVersion = nonEmptyOrFallback(
      options.promptVersion,
      defaultPromptVersion,
    );
    this.timeoutMs = positiveIntegerOrFallback(
      options.timeoutMs,
      defaultTimeoutMs,
    );
    this.maxOutputTokens = positiveIntegerOrFallback(
      options.maxOutputTokens,
      defaultMaxOutputTokens,
    );
    this.maxCandidates = positiveIntegerOrFallback(
      options.maxCandidates,
      defaultMaxCandidates,
    );
    this.verifiedAttestationSink = options.verifiedAttestationSink;
  }

  async label(
    input: ReaderSummaryTopicLabelerInput,
    attemptContext: ReaderSummaryTopicMapAttemptContext = defaultAttemptContext,
  ): Promise<ReaderSummaryTopicLabelPlan> {
    const candidates = selectAgentRuntimeReaderSummaryTopicCandidates(
      input,
      Math.min(this.maxCandidates, READER_SUMMARY_TOPIC_MAP_MAX_NODES),
    );
    const command = buildAgentRuntimeTopicLabelCommand({
      input,
      candidates,
      attemptContext,
      agentProvider: this.agentProvider,
      providerInstanceId: this.providerInstanceId,
      model: this.model,
      modelBackend: this.modelBackend,
      reasoningEffort: this.reasoningEffort,
      promptVersion: this.promptVersion,
      timeoutMs: this.timeoutMs,
      maxOutputTokens: this.maxOutputTokens,
    });
    const result = await this.client.runTask(command);
    const raw = readAgentRuntimeObjectOutput(
      result,
      parseAgentRuntimeReaderSummaryTopicLabelerJsonObject,
      "Reader summary topic map",
    );
    if (this.modelBackend === mimoReaderSummaryBackend) {
      assertMimoTopicLabelSchema(raw);
    }

    const plan = normalizeAgentRuntimeReaderSummaryTopicLabelPlan(
      raw,
      candidates,
    );
    await (this.modelBackend === mimoReaderSummaryBackend
      ? verifyAndRecordMimoDailyExecution
      : verifyAndRecordReaderSummaryExecution)({
      command,
      result,
      taskRole: "topic_label",
      attempt: String(attemptContext.attemptNumber),
      normalizedOutput: plan,
      sink: this.verifiedAttestationSink,
    });
    return plan;
  }
}

const defaultAttemptContext: ReaderSummaryTopicMapAttemptContext = {
  attemptNumber: 1,
  totalAttempts: 1,
};

export { resolveAgentRuntimeReaderSummaryTopicLabelerOptions } from "./agent-runtime-reader-summary-topic-labeler-options";
