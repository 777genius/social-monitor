import {
  readerSummaryScopeKey,
  type ReaderSummaryTopicLabelPlan,
} from "../../domain";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeProvider,
  ReaderSummaryTopicLabelerInput,
  ReaderSummaryTopicLabelerPort,
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

export type AgentRuntimeReaderSummaryTopicLabelerOptions = {
  readonly client: AgentRuntimeClientPort;
  readonly agentProvider?: AgentRuntimeProvider;
  readonly providerInstanceId?: string;
  readonly model?: string;
  readonly promptVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly maxCandidates?: number;
};

const defaultAgentProvider: AgentRuntimeProvider = "codex";
const defaultModel = "agent-runtime-reader-summary-topic-labeler";
const defaultPromptVersion = "reader_summary.topic_map.agent_runtime.v12";
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
  }

  async label(
    input: ReaderSummaryTopicLabelerInput,
  ): Promise<ReaderSummaryTopicLabelPlan> {
    const candidates = selectAgentRuntimeReaderSummaryTopicCandidates(
      input,
      this.maxCandidates,
    );
    const result = await this.client.runTask({
      requestId: buildAgentRuntimeRequestId(
        "reader-summary-topic-map",
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
      prompt: buildAgentRuntimeReaderSummaryTopicLabelPrompt(input, candidates),
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
      },
    });
    const raw = readAgentRuntimeObjectOutput(
      result,
      parseAgentRuntimeReaderSummaryTopicLabelerJsonObject,
      "Reader summary topic map",
    );

    return normalizeAgentRuntimeReaderSummaryTopicLabelPlan(raw, candidates);
  }
}

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
