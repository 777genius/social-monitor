import { buildAgentRuntimeTopicRelationCommand } from "./agent-runtime-reader-summary-topic-relation-command";
import {
  normalizeDecisions,
  parseJsonObject,
} from "./agent-runtime-reader-summary-topic-relation-decisions";
import type { ReaderSummaryTopicRelationDecision } from "../../domain";
import type {
  AgentRuntimeClientPort,
  ReaderSummaryTopicMapAttemptContext,
  ReaderSummaryTopicRelationVerifierInput,
  ReaderSummaryTopicRelationVerifierPort,
} from "../../ports";
import {
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
  verifyAndRecordReaderSummaryExecution,
  type VerifiedReaderSummaryExecutionAttestationSink,
} from "./reader-summary-execution-attestation";
import { assertStoryRelationResponseSchema } from "./story-relation-response-schema";
import {
  activeReaderSummaryModel,
  activeReaderSummaryReasoningEffort,
  assertReaderSummaryBackendModel,
  mimoReaderSummaryBackend,
  resolveReaderSummaryBackendEffort,
  resolveReaderSummaryDailyTaskIdentityFromEnv,
  type ReaderSummaryGenerationBackend,
  verifyAndRecordMimoDailyExecution,
} from "./active-reader-summary-generation-profile";

export type AgentRuntimeReaderSummaryTopicRelationVerifierOptions = Pick<
  AgentRuntimeReaderSummaryTopicLabelerOptions,
  "client" | "agentProvider" | "providerInstanceId" | "verifiedAttestationSink" |
  "reasoningEffort"
> & {
  readonly model?: string;
  readonly modelBackend?: ReaderSummaryGenerationBackend;
  readonly promptVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
};

const defaultModel = activeReaderSummaryModel;
const defaultPromptVersion = "reader_summary.topic_relation.agent_runtime.v3";
export const defaultTimeoutMs = 300_000;
const defaultMaxOutputTokens = 4_000;

export class AgentRuntimeReaderSummaryTopicRelationVerifier implements ReaderSummaryTopicRelationVerifierPort {
  private readonly client: AgentRuntimeClientPort;
  private readonly provider: "codex";
  private readonly providerInstanceId?: string;
  private readonly model: string;
  private readonly modelBackend: ReaderSummaryGenerationBackend;
  private readonly reasoningEffort: string;
  private readonly promptVersion: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly verifiedAttestationSink?: VerifiedReaderSummaryExecutionAttestationSink;

  constructor(options: AgentRuntimeReaderSummaryTopicRelationVerifierOptions) {
    this.client = options.client;
    this.provider = options.agentProvider ?? "codex";
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
    this.verifiedAttestationSink = options.verifiedAttestationSink;
  }

  async verify(
    input: ReaderSummaryTopicRelationVerifierInput,
    attemptContext: ReaderSummaryTopicMapAttemptContext = defaultAttemptContext,
  ): Promise<readonly ReaderSummaryTopicRelationDecision[]> {
    if (input.relations.length === 0) {
      return [];
    }
    const command = buildAgentRuntimeTopicRelationCommand({
      input,
      attemptContext,
      provider: this.provider,
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
      parseJsonObject,
      "Reader summary topic relation verifier",
    );
    if (this.modelBackend === mimoReaderSummaryBackend) {
      assertStoryRelationResponseSchema(raw, command.outputSchema);
    }

    const decisions = normalizeDecisions(raw, input.relations);
    await (this.modelBackend === mimoReaderSummaryBackend
      ? verifyAndRecordMimoDailyExecution
      : verifyAndRecordReaderSummaryExecution)({
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
    reasoningEffort: shared.reasoningEffort,
    ...resolveReaderSummaryDailyTaskIdentityFromEnv(
      env, env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_MODEL,
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

