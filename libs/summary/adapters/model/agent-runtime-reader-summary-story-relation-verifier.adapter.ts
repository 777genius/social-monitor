import {
  readerSummaryScopeKey,
  verifiedStoryRelationPairKey,
  type StoryRelationDecision,
} from "../../domain";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeProvider,
  ReaderSummaryStoryRelationVerifierInput,
  ReaderSummaryStoryRelationVerifierPort,
} from "../../ports";
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
  buildAgentRuntimeReaderSummaryStoryRelationVerifierPrompt,
} from "./agent-runtime-reader-summary-story-relation-verifier-prompt";

export type AgentRuntimeReaderSummaryStoryRelationVerifierOptions = Pick<
  AgentRuntimeReaderSummaryModelAdapterOptions,
  "client" | "agentProvider" | "providerInstanceId"
> & {
  readonly model?: string;
  readonly promptVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
};

const defaultModel = "agent-runtime-reader-summary-story-relation-verifier";
const defaultPromptVersion = "reader_summary.story_relation.agent_runtime.v2";
const defaultTimeoutMs = 300_000;
const defaultMaxOutputTokens = 6_000;

export class AgentRuntimeReaderSummaryStoryRelationVerifier implements ReaderSummaryStoryRelationVerifierPort {
  private readonly client: AgentRuntimeClientPort;
  private readonly provider: AgentRuntimeProvider;
  private readonly providerInstanceId?: string;
  private readonly model: string;
  private readonly promptVersion: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;

  constructor(options: AgentRuntimeReaderSummaryStoryRelationVerifierOptions) {
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
    input: ReaderSummaryStoryRelationVerifierInput,
  ): Promise<readonly StoryRelationDecision[]> {
    if (input.candidates.length === 0) {
      return [];
    }
    const result = await this.client.runTask({
      requestId: buildAgentRuntimeRequestId(
        "reader-summary-story-relations",
        input.tenantId,
        input.workspaceId,
        readerSummaryScopeKey(input.scope),
        input.requestedAt,
      ),
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      correlationId: buildAgentRuntimeRequestId(
        "reader-summary-story-relations-correlation",
        input.tenantId,
        input.workspaceId,
        readerSummaryScopeKey(input.scope),
        input.requestedAt,
      ),
      provider: this.provider,
      providerInstanceId: this.providerInstanceId,
      purpose: "social_monitor.reader_summary.verify_story_relations",
      systemPrompt: agentRuntimeReaderSummaryStoryRelationVerifierInstructions,
      prompt: buildAgentRuntimeReaderSummaryStoryRelationVerifierPrompt(input),
      outputSchema: agentRuntimeReaderSummaryStoryRelationVerifierJsonSchema,
      controls: {
        interactive: false,
        outputSchemaName: "social_monitor_reader_summary_story_relations",
        schemaVersion: "reader_summary.story_relation.v1",
        ...(this.model === defaultModel ? {} : { model: this.model }),
        maxOutputTokens: this.maxOutputTokens,
      },
      timeoutMs: this.timeoutMs,
      metadata: {
        adapter: "agent-runtime-reader-summary-story-relation-verifier",
        promptVersion: this.promptVersion,
      },
    });
    const raw = readAgentRuntimeObjectOutput(
      result,
      parseJsonObject,
      "Reader summary story relation verifier",
    );

    return normalizeDecisions(raw, input);
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

const normalizeDecisions = (
  raw: Record<string, unknown>,
  input: ReaderSummaryStoryRelationVerifierInput,
): readonly StoryRelationDecision[] => {
  const expectedPairs = new Set(
    input.candidates.map((candidate) =>
      verifiedStoryRelationPairKey(
        candidate.leftFeedItemId,
        candidate.rightFeedItemId,
      ),
    ),
  );
  const decisions = Array.isArray(raw.decisions)
    ? raw.decisions.flatMap(normalizeDecision)
    : [];
  const returnedPairs = new Set(
    decisions.map((decision) =>
      verifiedStoryRelationPairKey(
        decision.leftFeedItemId,
        decision.rightFeedItemId,
      ),
    ),
  );
  if (
    decisions.length !== expectedPairs.size ||
    returnedPairs.size !== expectedPairs.size ||
    [...expectedPairs].some((pair) => !returnedPairs.has(pair))
  ) {
    throw new Error(
      "Reader summary story relation response must decide every requested pair exactly once",
    );
  }
  return decisions;
};

const normalizeDecision = (
  value: unknown,
): readonly StoryRelationDecision[] => {
  if (!isRecord(value)) {
    return [];
  }
  const leftFeedItemId = stringValue(value.leftFeedItemId);
  const rightFeedItemId = stringValue(value.rightFeedItemId);
  if (
    leftFeedItemId === undefined ||
    rightFeedItemId === undefined ||
    typeof value.sameStory !== "boolean" ||
    typeof value.confidenceScore !== "number"
  ) {
    return [];
  }
  return [
    {
      leftFeedItemId,
      rightFeedItemId,
      sameStory: value.sameStory,
      confidenceScore: value.confidenceScore,
      rationale: stringValue(value.rationale),
    },
  ];
};

const parseJsonObject = (value: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) {
    throw new Error("Reader summary story relation response must be an object");
  }
  return parsed;
};

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
