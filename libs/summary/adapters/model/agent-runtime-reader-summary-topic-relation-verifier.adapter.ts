import {
  readerSummaryScopeKey,
  type ReaderSummaryTopicRelationDecision,
} from "../../domain";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeProvider,
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

export type AgentRuntimeReaderSummaryTopicRelationVerifierOptions = Pick<
  AgentRuntimeReaderSummaryTopicLabelerOptions,
  "client" | "agentProvider" | "providerInstanceId"
> & {
  readonly model?: string;
  readonly promptVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
};

const defaultModel = "agent-runtime-reader-summary-topic-relation-verifier";
const defaultPromptVersion = "reader_summary.topic_relation.agent_runtime.v3";
const defaultTimeoutMs = 300_000;
const defaultMaxOutputTokens = 4_000;

export class AgentRuntimeReaderSummaryTopicRelationVerifier implements ReaderSummaryTopicRelationVerifierPort {
  private readonly client: AgentRuntimeClientPort;
  private readonly provider: AgentRuntimeProvider;
  private readonly providerInstanceId?: string;
  private readonly model: string;
  private readonly promptVersion: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;

  constructor(options: AgentRuntimeReaderSummaryTopicRelationVerifierOptions) {
    this.client = options.client;
    this.provider = options.agentProvider ?? "codex";
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
  }

  async verify(
    input: ReaderSummaryTopicRelationVerifierInput,
  ): Promise<readonly ReaderSummaryTopicRelationDecision[]> {
    if (input.relations.length === 0) {
      return [];
    }
    const result = await this.client.runTask({
      requestId: buildAgentRuntimeRequestId(
        "reader-summary-topic-relations",
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
      purpose: "social_monitor.reader_summary.topic_map.verify_relations",
      systemPrompt: agentRuntimeReaderSummaryTopicRelationVerifierInstructions,
      prompt: buildAgentRuntimeReaderSummaryTopicRelationVerifierPrompt(input),
      outputSchema: agentRuntimeReaderSummaryTopicRelationVerifierJsonSchema,
      controls: {
        interactive: false,
        outputSchemaName: "social_monitor_reader_summary_topic_relations",
        schemaVersion: "reader_summary.topic_relation.v1",
        ...(this.model === defaultModel ? {} : { model: this.model }),
        maxOutputTokens: this.maxOutputTokens,
      },
      timeoutMs: this.timeoutMs,
      metadata: {
        adapter: "agent-runtime-reader-summary-topic-relation-verifier",
        promptVersion: this.promptVersion,
      },
    });
    const raw = readAgentRuntimeObjectOutput(
      result,
      parseJsonObject,
      "Reader summary topic relation verifier",
    );

    return normalizeDecisions(raw, input.relations);
  }
}

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
    model: env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_MODEL,
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
