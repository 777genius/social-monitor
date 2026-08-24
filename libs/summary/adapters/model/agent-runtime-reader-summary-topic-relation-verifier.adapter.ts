import {
  readerSummaryScopeKey,
  type ReaderSummaryTopicRelationDecision,
} from "../../domain";
import type {
  AgentRuntimeClientPort,
  ReaderSummaryTopicMapAttemptContext,
  ReaderSummaryTopicRelationVerifierInput,
  ReaderSummaryTopicRelationVerifierPort,
} from "../../ports";
import {
  buildAgentRuntimeRequestId,
  nonEmptyOrFallback,
  parsePositiveInteger,
  positiveIntegerOrFallback,
  readAgentRuntimeObjectOutput,
} from "./agent-runtime-model-support";
import {
  resolveAgentRuntimeReaderSummaryTopicLabelerOptions,
  type AgentRuntimeReaderSummaryTopicLabelerOptions,
} from "./agent-runtime-reader-summary-topic-labeler.adapter";
import {
  agentRuntimeReaderSummaryTopicRelationVerifierInstructions,
  agentRuntimeReaderSummaryTopicRelationVerifierJsonSchema,
  buildAgentRuntimeReaderSummaryTopicRelationVerifierPrompt,
} from "./agent-runtime-reader-summary-topic-relation-verifier-prompt";
import {
  verifyAndRecordReaderSummaryExecution,
  type VerifiedReaderSummaryExecutionAttestationSink,
} from "./reader-summary-execution-attestation";
import {
  activeReaderSummaryModel,
  activeReaderSummaryPurposes,
  activeReaderSummaryReasoningEffort,
  parseActiveReaderSummaryModel,
} from "./active-reader-summary-generation-profile";

export type AgentRuntimeReaderSummaryTopicRelationVerifierOptions = Pick<
  AgentRuntimeReaderSummaryTopicLabelerOptions,
  "client" | "agentProvider" | "providerInstanceId" | "verifiedAttestationSink"
> & {
  readonly model?: typeof activeReaderSummaryModel;
  readonly promptVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
};

const defaultModel = activeReaderSummaryModel;
const defaultPromptVersion = "reader_summary.topic_relation.agent_runtime.v3";
const defaultTimeoutMs = 300_000;
const defaultMaxOutputTokens = 4_000;

export class AgentRuntimeReaderSummaryTopicRelationVerifier implements ReaderSummaryTopicRelationVerifierPort {
  private readonly client: AgentRuntimeClientPort;
  private readonly provider: "codex";
  private readonly providerInstanceId?: string;
  private readonly model: string;
  private readonly promptVersion: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly verifiedAttestationSink?: VerifiedReaderSummaryExecutionAttestationSink;

  constructor(options: AgentRuntimeReaderSummaryTopicRelationVerifierOptions) {
    this.client = options.client;
    this.provider = options.agentProvider ?? "codex";
    this.providerInstanceId = options.providerInstanceId;
    this.model = options.model ?? defaultModel;
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
    this.verifiedAttestationSink = options.verifiedAttestationSink;
  }

  async verify(
    input: ReaderSummaryTopicRelationVerifierInput,
    attemptContext: ReaderSummaryTopicMapAttemptContext = defaultAttemptContext,
  ): Promise<readonly ReaderSummaryTopicRelationDecision[]> {
    if (input.relations.length === 0) {
      return [];
    }
    const command = {
      requestId: buildAgentRuntimeRequestId(
        `reader-summary-topic-relations-attempt-${attemptContext.attemptNumber}`,
        input.tenantId,
        input.workspaceId,
        readerSummaryScopeKey(input.scope),
        input.requestedAt,
      ),
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      correlationId: buildAgentRuntimeRequestId(
        "reader-summary-topic-relations-correlation",
        input.tenantId,
        input.workspaceId,
        readerSummaryScopeKey(input.scope),
        input.requestedAt,
      ),
      provider: this.provider,
      providerInstanceId: this.providerInstanceId,
      purpose: activeReaderSummaryPurposes.topicRelations,
      systemPrompt: agentRuntimeReaderSummaryTopicRelationVerifierInstructions,
      prompt: buildAgentRuntimeReaderSummaryTopicRelationVerifierPrompt(input),
      outputSchema: agentRuntimeReaderSummaryTopicRelationVerifierJsonSchema,
      controls: {
        interactive: false,
        outputSchemaName: "social_monitor_reader_summary_topic_relations",
        schemaVersion: "reader_summary.topic_relation.v1",
        model: this.model,
        reasoningEffort: activeReaderSummaryReasoningEffort,
        maxOutputTokens: this.maxOutputTokens,
      },
      timeoutMs: this.timeoutMs,
      metadata: {
        adapter: "agent-runtime-reader-summary-topic-relation-verifier",
        promptVersion: this.promptVersion,
        attemptNumber: String(attemptContext.attemptNumber),
        totalAttempts: String(attemptContext.totalAttempts),
      },
    } as const;
    const result = await this.client.runTask(command);
    const raw = readAgentRuntimeObjectOutput(
      result,
      parseJsonObject,
      "Reader summary topic relation verifier",
    );

    const decisions = normalizeDecisions(raw, input.relations);
    await verifyAndRecordReaderSummaryExecution({
      command,
      result,
      taskRole: "topic_relation",
      attempt: String(attemptContext.attemptNumber),
      normalizedOutput: decisions,
      sink: this.verifiedAttestationSink,
    });
    return decisions;
  }
}

const defaultAttemptContext: ReaderSummaryTopicMapAttemptContext = {
  attemptNumber: 1,
  totalAttempts: 1,
};

export const resolveAgentRuntimeReaderSummaryTopicRelationVerifierOptions = (
  env: NodeJS.ProcessEnv,
  client: AgentRuntimeClientPort,
): AgentRuntimeReaderSummaryTopicRelationVerifierOptions => {
  const shared = resolveAgentRuntimeReaderSummaryTopicLabelerOptions(
    env,
    client,
  );

  return {
    client,
    agentProvider: shared.agentProvider,
    providerInstanceId: shared.providerInstanceId,
    model: parseActiveReaderSummaryModel(
      env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_MODEL ??
        env.AGENT_RUNTIME_READER_SUMMARY_MODEL,
    ),
    promptVersion:
      env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_PROMPT_VERSION,
    timeoutMs: parsePositiveInteger(
      env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_TIMEOUT_MS ??
        env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_TIMEOUT_MS ??
        env.AGENT_RUNTIME_TIMEOUT_MS,
    ),
    maxOutputTokens: parsePositiveInteger(
      env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_MAX_OUTPUT_TOKENS,
    ),
  };
};

const normalizeDecisions = (
  raw: Record<string, unknown>,
  relations: ReaderSummaryTopicRelationVerifierInput["relations"],
): readonly ReaderSummaryTopicRelationDecision[] => {
  const expectedPairs = new Set(relations.map(relationPairKey));
  const decisions = Array.isArray(raw.decisions)
    ? raw.decisions.flatMap((value) => {
        if (!isRecord(value)) {
          return [];
        }
        const sourceNodeId = stringValue(value.sourceNodeId);
        const targetNodeId = stringValue(value.targetNodeId);
        const sameTopic = value.sameTopic;
        const confidenceScore = value.confidenceScore;
        if (
          sourceNodeId === undefined ||
          targetNodeId === undefined ||
          typeof sameTopic !== "boolean" ||
          typeof confidenceScore !== "number" ||
          confidenceScore < 0 ||
          confidenceScore > 1
        ) {
          return [];
        }

        return [
          {
            sourceNodeId,
            targetNodeId,
            sameTopic,
            confidenceScore,
            rationale: stringValue(value.rationale),
          },
        ];
      })
    : [];
  const returnedPairs = new Set(decisions.map(relationPairKey));
  if (
    decisions.length !== expectedPairs.size ||
    returnedPairs.size !== expectedPairs.size ||
    [...expectedPairs].some((pair) => !returnedPairs.has(pair))
  ) {
    throw new Error(
      "Reader summary topic relation response must decide every requested pair exactly once",
    );
  }

  return decisions;
};

const relationPairKey = (pair: {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
}): string => [pair.sourceNodeId, pair.targetNodeId].sort().join("\u0000");

const parseJsonObject = (value: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) {
    throw new Error("Reader summary topic relation response must be an object");
  }

  return parsed;
};

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
