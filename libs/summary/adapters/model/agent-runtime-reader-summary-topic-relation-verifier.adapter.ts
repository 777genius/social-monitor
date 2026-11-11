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
import { readAgentRuntimeObjectOutput } from "./agent-runtime-model-support";
import type {
  AgentRuntimeReaderSummaryTopicLabelerOptions,
} from "./agent-runtime-reader-summary-topic-labeler.adapter";
import {
  verifyAndRecordReaderSummaryExecution,
  type VerifiedReaderSummaryExecutionAttestationSink,
} from "./reader-summary-execution-attestation";
import { assertStoryRelationResponseSchema } from "./story-relation-response-schema";
import { resolveTopicRelationVerifierConfig } from "./agent-runtime-reader-summary-topic-relation-options";
import {
  mimoReaderSummaryBackend,
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

export { topicRelationVerifierDefaultTimeoutMs as defaultTimeoutMs } from "./agent-runtime-reader-summary-topic-relation-options";

export class AgentRuntimeReaderSummaryTopicRelationVerifier implements ReaderSummaryTopicRelationVerifierPort {
  private readonly client: AgentRuntimeClientPort;
  private readonly config: ReturnType<typeof resolveTopicRelationVerifierConfig>;
  private readonly providerInstanceId?: string;
  private readonly verifiedAttestationSink?: VerifiedReaderSummaryExecutionAttestationSink;

  constructor(options: AgentRuntimeReaderSummaryTopicRelationVerifierOptions) {
    this.client = options.client;
    this.config = resolveTopicRelationVerifierConfig(options);
    this.providerInstanceId = options.providerInstanceId;
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
      ...this.config,
      providerInstanceId: this.providerInstanceId,
    });
    const result = await this.client.runTask(command);
    const raw = readAgentRuntimeObjectOutput(
      result,
      parseJsonObject,
      "Reader summary topic relation verifier",
    );
    if (this.config.modelBackend === mimoReaderSummaryBackend) {
      assertStoryRelationResponseSchema(raw, command.outputSchema);
    }

    const decisions = normalizeDecisions(raw, input.relations);
    await (this.config.modelBackend === mimoReaderSummaryBackend
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

export { resolveAgentRuntimeReaderSummaryTopicRelationVerifierOptions } from "./agent-runtime-reader-summary-topic-relation-options";
