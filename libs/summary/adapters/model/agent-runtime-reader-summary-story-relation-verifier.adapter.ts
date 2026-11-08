import { buildAgentRuntimeStoryRelationCommand } from "./agent-runtime-reader-summary-story-relation-command";
import {
  readDecisionEnvelope,
  normalizeBinaryDecisions,
  parseJsonObject,
} from "./agent-runtime-reader-summary-story-relation-decoder";
import type {
  AgentRuntimeClientPort,
  ReaderSummaryStoryRelationVerifierInput,
  ReaderSummaryStoryRelationVerifierPort,
} from "../../ports";
import {
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
  verifyAndRecordReaderSummaryExecution,
  type VerifiedReaderSummaryExecutionAttestationSink,
} from "./reader-summary-execution-attestation";
import {
  activeReaderSummaryModel,
  activeReaderSummaryReasoningEffort,
  assertActiveReaderSummaryProvider,
  assertReaderSummaryBackendModel,
  mimoReaderSummaryBackend,
  resolveReaderSummaryBackendEffort,
  resolveReaderSummaryDailyTaskIdentityFromEnv,
  type ReaderSummaryGenerationBackend,
  verifyAndRecordMimoDailyExecution,
} from "./active-reader-summary-generation-profile";

import { assertStoryRelationResponseSchema } from "./story-relation-response-schema";

export type AgentRuntimeReaderSummaryStoryRelationVerifierOptions = Pick<
  AgentRuntimeReaderSummaryModelAdapterOptions,
  "client" | "agentProvider" | "providerInstanceId" | "verifiedAttestationSink" |
  "reasoningEffort"
> & {
  readonly model?: string;
  readonly modelBackend?: ReaderSummaryGenerationBackend;
  readonly promptVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly relatedTopicPromptVersion?: string;
  readonly relatedTopicTimeoutMs?: number;
};

const defaultModel = activeReaderSummaryModel;
const defaultPromptVersion = "reader_summary.story_relation.agent_runtime.v3";
const defaultRelatedTopicPromptVersion = "reader_summary.related_topic_relation.agent_runtime.v1";
const defaultRelatedTopicTimeoutMs = 15_000;
const defaultTimeoutMs = 300_000;
const defaultMaxOutputTokens = 6_000;

export class AgentRuntimeReaderSummaryStoryRelationVerifier implements ReaderSummaryStoryRelationVerifierPort {
  private readonly client: AgentRuntimeClientPort;
  private readonly provider: "codex";
  private readonly providerInstanceId?: string;
  private readonly model: string;
  private readonly modelBackend: ReaderSummaryGenerationBackend;
  private readonly reasoningEffort: string;
  private readonly promptVersion: string;
  private readonly relatedTopicPromptVersion: string;
  private readonly relatedTopicTimeoutMs: number;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly verifiedAttestationSink?: VerifiedReaderSummaryExecutionAttestationSink;

  constructor(options: AgentRuntimeReaderSummaryStoryRelationVerifierOptions) {
    this.client = options.client;
    this.provider =
      assertActiveReaderSummaryProvider(options.agentProvider) ?? "codex";
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
    const relatedTopicLane = input.verificationLane === "related_topic";
    const command = buildAgentRuntimeStoryRelationCommand({
      input,
      provider: this.provider,
      providerInstanceId: this.providerInstanceId,
      model: this.model,
      modelBackend: this.modelBackend,
      reasoningEffort: this.reasoningEffort,
      promptVersion: this.promptVersion,
      relatedTopicPromptVersion: this.relatedTopicPromptVersion,
      timeoutMs: this.timeoutMs,
      relatedTopicTimeoutMs: this.relatedTopicTimeoutMs,
      maxOutputTokens: this.maxOutputTokens,
    });
    const result = await this.client.runTask(command, { signal: input.signal });
    const raw = readAgentRuntimeObjectOutput(
      result,
      (text) => parseJsonObject(text, command.outputSchema),
      "Reader summary story relation verifier",
    );

    assertStoryRelationResponseSchema(raw, command.outputSchema);

    const decisions = relatedTopicLane
      ? readDecisionEnvelope(raw)
      : normalizeBinaryDecisions(raw);
    await (this.modelBackend === mimoReaderSummaryBackend
      ? verifyAndRecordMimoDailyExecution
      : verifyAndRecordReaderSummaryExecution)({
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
    reasoningEffort: shared.reasoningEffort,
    ...resolveReaderSummaryDailyTaskIdentityFromEnv(
      env, env.AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_MODEL,
    ),
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

