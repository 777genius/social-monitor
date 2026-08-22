import {
  readerSummaryScopeKey,
} from "../../domain";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeProvider,
  ReaderSummaryStoryRelationVerifierInput,
  ReaderSummaryStoryRelationVerifierPort,
} from "../../ports";
import { InvalidStoryRelationDecisionBatchError } from "../../ports";
import {
  buildAgentRuntimeRequestId,
  nonEmptyOrFallback,
  parsePositiveInteger,
  positiveIntegerOrFallback,
  readAgentRuntimeObjectOutput,
} from "./agent-runtime-model-support";
import {
  resolveAgentRuntimeReaderSummaryModelOptions,
  type AgentRuntimeReaderSummaryModelAdapterOptions,
} from "./agent-runtime-reader-summary-model.adapter";
import {
  agentRuntimeReaderSummaryStoryRelationVerifierInstructions,
  agentRuntimeReaderSummaryStoryRelationVerifierJsonSchema,
  agentRuntimeReaderSummaryRelatedTopicVerifierInstructions,
  agentRuntimeReaderSummaryRelatedTopicVerifierJsonSchema,
  buildAgentRuntimeReaderSummaryStoryRelationVerifierPrompt,
  buildAgentRuntimeReaderSummaryRelatedTopicVerifierPrompt,
} from "./agent-runtime-reader-summary-story-relation-verifier-prompt";
import {
  verifyAndRecordReaderSummaryExecution,
  type VerifiedReaderSummaryExecutionAttestationSink,
} from "./reader-summary-execution-attestation";

export type AgentRuntimeReaderSummaryStoryRelationVerifierOptions = Pick<
  AgentRuntimeReaderSummaryModelAdapterOptions,
  "client" | "agentProvider" | "providerInstanceId" | "verifiedAttestationSink"
> & {
  readonly model?: string;
  readonly promptVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly relatedTopicPromptVersion?: string;
  readonly relatedTopicTimeoutMs?: number;
};

const defaultModel = "agent-runtime-reader-summary-story-relation-verifier";
const defaultPromptVersion = "reader_summary.story_relation.agent_runtime.v2";
const defaultRelatedTopicPromptVersion = "reader_summary.related_topic_relation.agent_runtime.v1";
const defaultRelatedTopicTimeoutMs = 15_000;
const defaultTimeoutMs = 300_000;
const defaultMaxOutputTokens = 6_000;

export class AgentRuntimeReaderSummaryStoryRelationVerifier implements ReaderSummaryStoryRelationVerifierPort {
  private readonly client: AgentRuntimeClientPort;
  private readonly provider: AgentRuntimeProvider;
  private readonly providerInstanceId?: string;
  private readonly model: string;
  private readonly promptVersion: string;
  private readonly relatedTopicPromptVersion: string;
  private readonly relatedTopicTimeoutMs: number;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly verifiedAttestationSink?: VerifiedReaderSummaryExecutionAttestationSink;

  constructor(options: AgentRuntimeReaderSummaryStoryRelationVerifierOptions) {
    this.client = options.client;
    this.provider = options.agentProvider ?? "codex";
    this.providerInstanceId = options.providerInstanceId;
    this.model = nonEmptyOrFallback(options.model, defaultModel);
    this.promptVersion = nonEmptyOrFallback(
      options.promptVersion,
      defaultPromptVersion,
    );
    this.relatedTopicPromptVersion = nonEmptyOrFallback(
      options.relatedTopicPromptVersion,
      defaultRelatedTopicPromptVersion,
    );
    this.timeoutMs = positiveIntegerOrFallback(
      options.timeoutMs,
      defaultTimeoutMs,
    );
    this.maxOutputTokens = positiveIntegerOrFallback(
      options.maxOutputTokens,
      defaultMaxOutputTokens,
    );
    this.relatedTopicTimeoutMs = positiveIntegerOrFallback(
      options.relatedTopicTimeoutMs,
      defaultRelatedTopicTimeoutMs,
    );
    this.verifiedAttestationSink = options.verifiedAttestationSink;
  }

  async verify(
    input: ReaderSummaryStoryRelationVerifierInput,
  ): Promise<readonly unknown[]> {
    if (input.candidates.length === 0) {
      return [];
    }
    const scopeKey = readerSummaryScopeKey(input.scope);
    const requestScopeKey = input.verificationLane === "safe_recall_shadow"
      ? `${scopeKey}:safe-recall-shadow`
      : input.verificationLane === "related_topic"
        ? `${scopeKey}:related-topic`
        : scopeKey;
    const relatedTopicLane = input.verificationLane === "related_topic";
    const command = {
      requestId: buildAgentRuntimeRequestId(
        relatedTopicLane
          ? "reader-summary-related-topic-relations"
          : "reader-summary-story-relations",
        input.tenantId,
        input.workspaceId,
        requestScopeKey,
        input.requestedAt,
      ),
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      correlationId: buildAgentRuntimeRequestId(
        relatedTopicLane
          ? "reader-summary-related-topic-relations-correlation"
          : "reader-summary-story-relations-correlation",
        input.tenantId,
        input.workspaceId,
        requestScopeKey,
        input.requestedAt,
      ),
      provider: this.provider,
      providerInstanceId: this.providerInstanceId,
      purpose: relatedTopicLane
        ? "social_monitor.reader_summary.verify_related_topic_relations"
        : "social_monitor.reader_summary.verify_story_relations",
      systemPrompt: relatedTopicLane
        ? agentRuntimeReaderSummaryRelatedTopicVerifierInstructions
        : agentRuntimeReaderSummaryStoryRelationVerifierInstructions,
      prompt: relatedTopicLane
        ? buildAgentRuntimeReaderSummaryRelatedTopicVerifierPrompt(input)
        : buildAgentRuntimeReaderSummaryStoryRelationVerifierPrompt(input),
      outputSchema: relatedTopicLane
        ? agentRuntimeReaderSummaryRelatedTopicVerifierJsonSchema
        : agentRuntimeReaderSummaryStoryRelationVerifierJsonSchema,
      controls: {
        interactive: false,
        outputSchemaName: relatedTopicLane
          ? "social_monitor_reader_summary_related_topic_relations"
          : "social_monitor_reader_summary_story_relations",
        schemaVersion: relatedTopicLane
          ? "reader_summary.related_topic_relation.v1"
          : "reader_summary.story_relation.v1",
        ...(this.model === defaultModel ? {} : { model: this.model }),
        maxOutputTokens: this.maxOutputTokens,
      },
      timeoutMs: relatedTopicLane
        ? (input.timeoutMs ?? this.relatedTopicTimeoutMs)
        : input.verificationLane === "safe_recall_shadow"
          ? (input.timeoutMs ?? this.timeoutMs)
          : this.timeoutMs,
      metadata: {
        adapter: "agent-runtime-reader-summary-story-relation-verifier",
        promptVersion: relatedTopicLane
          ? this.relatedTopicPromptVersion
          : this.promptVersion,
        ...(relatedTopicLane
          ? { taskRole: "related_topic_relation" }
          : {}),
        ...(input.verificationLane === undefined
          ? {}
          : { verificationLane: input.verificationLane }),
      },
    } as const;
    const result = await this.client.runTask(command, { signal: input.signal });
    const raw = readAgentRuntimeObjectOutput(
      result,
      parseJsonObject,
      "Reader summary story relation verifier",
    );

    const decisions = relatedTopicLane
      ? readDecisionEnvelope(raw)
      : normalizeBinaryDecisions(raw);
    await verifyAndRecordReaderSummaryExecution({
      command,
      result,
      taskRole: relatedTopicLane ? "related_topic_relation" : "story_relation",
      attempt: relatedTopicLane ? "related-topic" : "primary",
      normalizedOutput: decisions,
      sink:
        input.verificationLane === "safe_recall_shadow"
          ? undefined
          : this.verifiedAttestationSink,
    });
    return decisions;
  }
}

export const resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions = (
  env: NodeJS.ProcessEnv,
  client: AgentRuntimeClientPort,
): AgentRuntimeReaderSummaryStoryRelationVerifierOptions => {
  const shared = resolveAgentRuntimeReaderSummaryModelOptions(env, client);
  return {
    client,
    agentProvider: shared.agentProvider,
    providerInstanceId: shared.providerInstanceId,
    model: env.AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_MODEL,
    promptVersion:
      env.AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_PROMPT_VERSION,
    relatedTopicPromptVersion:
      env.AGENT_RUNTIME_READER_SUMMARY_RELATED_TOPIC_VERIFIER_PROMPT_VERSION,
    relatedTopicTimeoutMs: parsePositiveInteger(
      env.AGENT_RUNTIME_READER_SUMMARY_RELATED_TOPIC_VERIFIER_TIMEOUT_MS,
    ),
    timeoutMs: parsePositiveInteger(
      env.AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_TIMEOUT_MS ??
        env.AGENT_RUNTIME_READER_SUMMARY_MODEL_TIMEOUT_MS ??
        env.AGENT_RUNTIME_TIMEOUT_MS,
    ),
    maxOutputTokens: parsePositiveInteger(
      env.AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_MAX_OUTPUT_TOKENS,
    ),
  };
};

const readDecisionEnvelope = (
  raw: Record<string, unknown>,
): readonly unknown[] => {
  const properties = Object.keys(raw);
  if (properties.some((property) => property !== "decisions")) {
    throw invalidDecisionEnvelope("envelope_unknown_property");
  }
  if (!Array.isArray(raw.decisions)) {
    throw invalidDecisionEnvelope("envelope_missing_decisions");
  }
  return raw.decisions;
};

const normalizeBinaryDecisions = (
  raw: Record<string, unknown>,
): readonly unknown[] =>
  Array.isArray(raw.decisions)
    ? raw.decisions.map(normalizeBinaryDecision)
    : [];

const normalizeBinaryDecision = (
  value: unknown,
): unknown => {
  if (!isRecord(value)) return value;
  const { rationale, ...properties } = value;
  const leftFeedItemId = stringValue(value.leftFeedItemId);
  const rightFeedItemId = stringValue(value.rightFeedItemId);
  return {
    ...properties,
    ...(leftFeedItemId === undefined ? {} : { leftFeedItemId }),
    ...(rightFeedItemId === undefined ? {} : { rightFeedItemId }),
    ...(rationale === undefined
      ? {}
      : typeof rationale === "string"
        ? { rationale: rationale.trim() }
        : { rationale }),
  };
};

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const invalidDecisionEnvelope = (
  reason: ConstructorParameters<typeof InvalidStoryRelationDecisionBatchError>[0],
): Error => new InvalidStoryRelationDecisionBatchError(reason);

const parseJsonObject = (value: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) {
    throw invalidDecisionEnvelope("envelope_invalid_shape");
  }
  return parsed;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
