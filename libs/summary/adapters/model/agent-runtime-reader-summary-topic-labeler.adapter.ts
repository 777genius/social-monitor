import { fromJSONSchema } from "zod";
import {
  READER_SUMMARY_TOPIC_MAP_MAX_NODES,
  readerSummaryScopeKey,
  type ReaderSummaryTopicLabelPlan,
} from "../../domain";
import type {
  AgentRuntimeClientPort,
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
import {
  activeReaderSummaryModel,
  activeReaderSummaryProvider,
  activeReaderSummaryPurposes,
  activeReaderSummaryReasoningEffort,
  assertActiveReaderSummaryProvider,
  mimoReaderSummaryBackend,
  mimoReaderSummaryModel,
  parseActiveReaderSummaryReasoningEffort,
  resolveReaderSummaryDailyTaskIdentityFromEnv,
  type ReaderSummaryGenerationBackend,
  verifyAndRecordMimoDailyExecution,
} from "./active-reader-summary-generation-profile";

export type AgentRuntimeReaderSummaryTopicLabelerOptions = {
  readonly client: AgentRuntimeClientPort;
  readonly agentProvider?: typeof activeReaderSummaryProvider;
  readonly providerInstanceId?: string;
  readonly model?: typeof activeReaderSummaryModel | typeof mimoReaderSummaryModel;
  readonly modelBackend?: ReaderSummaryGenerationBackend;
  readonly reasoningEffort?: typeof activeReaderSummaryReasoningEffort;
  readonly promptVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly maxCandidates?: number;
  readonly verifiedAttestationSink?: VerifiedReaderSummaryExecutionAttestationSink;
};

const defaultAgentProvider = activeReaderSummaryProvider;
const defaultModel = activeReaderSummaryModel;
const defaultPromptVersion = "reader_summary.topic_map.agent_runtime.v21";
const defaultTimeoutMs = 600_000;
const defaultMaxOutputTokens = 6_000;
const defaultMaxCandidates = 30;
let mimoTopicLabelSchema: ReturnType<typeof fromJSONSchema> | undefined;

export class AgentRuntimeReaderSummaryTopicLabeler implements ReaderSummaryTopicLabelerPort {
  private readonly client: AgentRuntimeClientPort;
  private readonly agentProvider: typeof activeReaderSummaryProvider;
  private readonly providerInstanceId?: string;
  private readonly model: string;
  private readonly modelBackend: ReaderSummaryGenerationBackend;
  private readonly reasoningEffort: typeof activeReaderSummaryReasoningEffort;
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
    if (this.modelBackend === mimoReaderSummaryBackend && this.model !== mimoReaderSummaryModel) {
      throw new Error("MiMo reader summary model conflicts with purpose policy");
    }
    this.reasoningEffort =
      options.reasoningEffort ?? activeReaderSummaryReasoningEffort;
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
      purpose: activeReaderSummaryPurposes.topicLabel,
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
        model: this.model,
        ...(this.modelBackend === mimoReaderSummaryBackend
          ? { modelBackend: this.modelBackend, toolsEnabled: false, toolPolicy: "none" }
          : {}),
        reasoningEffort: this.reasoningEffort,
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
    if (this.modelBackend === mimoReaderSummaryBackend) {
      mimoTopicLabelSchema ??= fromJSONSchema(
        agentRuntimeReaderSummaryTopicLabelerJsonSchema as Record<string, unknown>,
      );
      if (!mimoTopicLabelSchema.safeParse(raw).success) {
        throw new Error("MiMo topic label output conflicts with purpose schema");
      }
      assertMimoTopicLabelOwnKeys(raw);
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

const assertMimoTopicLabelOwnKeys = (raw: Record<string, unknown>): void => {
  const schema = agentRuntimeReaderSummaryTopicLabelerJsonSchema;
  const hasOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[]) =>
    Object.keys(value).every((key) => allowed.includes(key));
  if (!hasOnlyKeys(raw, Object.keys(schema.properties))) {
    throw new Error("MiMo topic label output conflicts with purpose schema");
  }
  for (const [values, itemSchema] of [
    [raw.nodeLabels, schema.properties.nodeLabels.items],
    [raw.groups, schema.properties.groups.items],
  ] as const) {
    if (!Array.isArray(values) || values.some((value) =>
      value === null || typeof value !== "object" || Array.isArray(value) ||
      !hasOnlyKeys(value as Record<string, unknown>, Object.keys(itemSchema.properties)))) {
      throw new Error("MiMo topic label output conflicts with purpose schema");
    }
  }
};

export const resolveAgentRuntimeReaderSummaryTopicLabelerOptions = (
  env: NodeJS.ProcessEnv,
  client: AgentRuntimeClientPort,
): AgentRuntimeReaderSummaryTopicLabelerOptions => ({
  client,
    agentProvider: assertActiveReaderSummaryProvider(
      env.AGENT_RUNTIME_PROVIDER,
    ),
  providerInstanceId: env.AGENT_RUNTIME_PROVIDER_INSTANCE_ID,
    ...resolveReaderSummaryDailyTaskIdentityFromEnv(
      env, env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_MODEL,
    ),
    reasoningEffort: parseActiveReaderSummaryReasoningEffort(
      env.AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT ??
        env.AGENT_RUNTIME_REASONING_EFFORT,
    ),
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
