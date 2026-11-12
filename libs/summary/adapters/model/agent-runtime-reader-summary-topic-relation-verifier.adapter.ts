import { buildAgentRuntimeTopicRelationCommand } from "./agent-runtime-reader-summary-topic-relation-command";
import { executeAgentRuntimeTopicRelationVerification } from "./agent-runtime-reader-summary-topic-relation-execution";
import type { ReaderSummaryTopicRelationDecision } from "../../domain";
import type {
  AgentRuntimeClientPort,
  ReaderSummaryTopicMapAttemptContext,
  ReaderSummaryTopicRelationVerifierInput,
  ReaderSummaryTopicRelationVerifierPort,
} from "../../ports";
import type {
  AgentRuntimeReaderSummaryTopicLabelerOptions,
} from "./agent-runtime-reader-summary-topic-labeler.adapter";
import type { VerifiedReaderSummaryExecutionAttestationSink } from "./reader-summary-execution-attestation";
import { resolveTopicRelationVerifierConfig } from "./agent-runtime-reader-summary-topic-relation-options";
import type { ReaderSummaryGenerationBackend } from "./active-reader-summary-generation-profile";

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
    return executeAgentRuntimeTopicRelationVerification({
      client: this.client,
      command,
      input,
      attemptContext,
      modelBackend: this.config.modelBackend,
      sink: this.verifiedAttestationSink,
    });
  }
}

const defaultAttemptContext: ReaderSummaryTopicMapAttemptContext = {
  attemptNumber: 1,
  totalAttempts: 1,
};

export { resolveAgentRuntimeReaderSummaryTopicRelationVerifierOptions } from "./agent-runtime-reader-summary-topic-relation-options";
