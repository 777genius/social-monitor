import {
  readerSummaryScopeKey,
  type ReaderSummaryTopicLabelPlan,
} from "../../domain";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeProvider,
  ReaderSummaryTopicLabelerInput,
  ReaderSummaryTopicLabelerPort,
  ReaderSummaryTopicMapAttemptContext,
} from "../../ports";
import {
  buildAgentRuntimeRequestId,
  nonEmptyOrFallback,
  parsePositiveInteger,
  positiveIntegerOrFallback,
  readAgentRuntimeObjectOutput,
} from "./agent-runtime-model-support";
import {
  normalizeAgentRuntimeReaderSummaryTopicLabelPlan,
  parseAgentRuntimeReaderSummaryTopicLabelerJsonObject,
} from "./agent-runtime-reader-summary-topic-label-plan-normalizer";
import {
  agentRuntimeReaderSummaryTopicLabelerInstructions,
  agentRuntimeReaderSummaryTopicLabelerJsonSchema,
  buildAgentRuntimeReaderSummaryTopicLabelPrompt,
  selectAgentRuntimeReaderSummaryTopicCandidates,
} from "./agent-runtime-reader-summary-topic-labeler-prompt";
import {
  verifyAndRecordReaderSummaryExecution,
  type VerifiedReaderSummaryExecutionAttestationSink,
} from "./reader-summary-execution-attestation";

export type AgentRuntimeReaderSummaryTopicLabelerOptions = {
  readonly client: AgentRuntimeClientPort;
  readonly agentProvider?: AgentRuntimeProvider;
  readonly providerInstanceId?: string;
  readonly model?: string;
  readonly promptVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly maxCandidates?: number;
  readonly verifiedAttestationSink?: VerifiedReaderSummaryExecutionAttestationSink;
};

const defaultAgentProvider: AgentRuntimeProvider = "codex";
const defaultModel = "agent-runtime-reader-summary-topic-labeler";
const defaultPromptVersion = "reader_summary.topic_map.agent_runtime.v16";
const defaultTimeoutMs = 600_000;
const defaultMaxOutputTokens = 6_000;
const defaultMaxCandidates = 30;

export class AgentRuntimeReaderSummaryTopicLabeler implements ReaderSummaryTopicLabelerPort {
  private readonly client: AgentRuntimeClientPort;
  private readonly agentProvider: AgentRuntimeProvider;
  private readonly providerInstanceId?: string;
  private readonly model: string;
  private readonly promptVersion: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly maxCandidates: number;
  private readonly verifiedAttestationSink?: VerifiedReaderSummaryExecutionAttestationSink;

  constructor(options: AgentRuntimeReaderSummaryTopicLabelerOptions) {
    this.client = options.client;
    this.agentProvider = options.agentProvider ?? defaultAgentProvider;
    this.providerInstanceId = options.providerInstanceId;
    this.model = nonEmptyOrFallback(options.model, defaultModel);
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
      this.maxCandidates,
    );
    const command = {
      requestId: buildAgentRuntimeRequestId(
        `reader-summary-topic-map-attempt-${attemptContext.attemptNumber}`,
        input.tenantId,
        input.workspaceId,
        readerSummaryScopeKey(input.scope),
        input.requestedAt,
      ),
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      correlationId: buildAgentRuntimeRequestId(
        "reader-summary-topic-map-correlation",
        input.tenantId,
        input.workspaceId,
        readerSummaryScopeKey(input.scope),
        input.requestedAt,
      ),
      provider: this.agentProvider,
      providerInstanceId: this.providerInstanceId,
      purpose: "social_monitor.reader_summary.topic_map.label",
      systemPrompt: agentRuntimeReaderSummaryTopicLabelerInstructions,
      prompt: buildAgentRuntimeReaderSummaryTopicLabelPrompt(
        input,
        candidates,
        attemptContext,
      ),
      outputSchema: agentRuntimeReaderSummaryTopicLabelerJsonSchema,
      controls: {
        interactive: false,
        outputSchemaName: "social_monitor_reader_summary_topic_map_labels",
        schemaVersion: "reader_summary.topic_map.v1",
        ...runtimeModelControl(this.model, defaultModel),
        maxOutputTokens: this.maxOutputTokens,
      },
      timeoutMs: this.timeoutMs,
      metadata: {
        adapter: "agent-runtime-reader-summary-topic-labeler",
        promptVersion: this.promptVersion,
        attemptNumber: String(attemptContext.attemptNumber),
        totalAttempts: String(attemptContext.totalAttempts),
      },
    } as const;
    const result = await this.client.runTask(command);
    const raw = readAgentRuntimeObjectOutput(
      result,
      parseAgentRuntimeReaderSummaryTopicLabelerJsonObject,
      "Reader summary topic map",
    );

    const plan = normalizeAgentRuntimeReaderSummaryTopicLabelPlan(
      raw,
      candidates,
    );
    await verifyAndRecordReaderSummaryExecution({
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

export const resolveAgentRuntimeReaderSummaryTopicLabelerOptions = (
  env: NodeJS.ProcessEnv,
  client: AgentRuntimeClientPort,
): AgentRuntimeReaderSummaryTopicLabelerOptions => ({
  client,
  agentProvider: parseAgentRuntimeProvider(env.AGENT_RUNTIME_PROVIDER),
  providerInstanceId: env.AGENT_RUNTIME_PROVIDER_INSTANCE_ID,
  model: env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_MODEL,
  promptVersion: env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_PROMPT_VERSION,
  timeoutMs: parsePositiveInteger(
    env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_TIMEOUT_MS ??
      env.AGENT_RUNTIME_TIMEOUT_MS,
  ),
  maxOutputTokens: parsePositiveInteger(
    env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_MAX_OUTPUT_TOKENS,
  ),
  maxCandidates: parsePositiveInteger(
    env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_MAX_CANDIDATES,
  ),
});

const parseAgentRuntimeProvider = (
  value: string | undefined,
): AgentRuntimeProvider | undefined => {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  if (value === "codex" || value === "claude") {
    return value;
  }

  throw new Error('AGENT_RUNTIME_PROVIDER must be "codex" or "claude"');
};

const runtimeModelControl = (
  model: string,
  defaultModelAlias: string,
): { readonly model?: string } =>
  model === defaultModelAlias ? {} : { model };
