import { buildAgentRuntimeTopicLabelCommand } from "./agent-runtime-reader-summary-topic-label-command";
import type { ReaderSummaryTopicLabelPlan } from "../../domain";
import type {
  AgentRuntimeClientPort,
  ReaderSummaryTopicLabelerInput,
  ReaderSummaryTopicLabelerPort,
  ReaderSummaryTopicMapAttemptContext,
} from "../../ports";
import { selectAgentRuntimeReaderSummaryTopicCandidates } from "./agent-runtime-reader-summary-topic-labeler-prompt";
import type { VerifiedReaderSummaryExecutionAttestationSink } from "./reader-summary-execution-attestation";
import { executeAgentRuntimeTopicLabeling } from "./agent-runtime-reader-summary-topic-label-execution";
import {
  resolveAgentRuntimeTopicLabelerSettings,
  type AgentRuntimeReaderSummaryTopicLabelerOptions,
  type AgentRuntimeTopicLabelerSettings,
} from "./agent-runtime-reader-summary-topic-labeler-runtime-settings";
export {
  defaultTimeoutMs,
} from "./agent-runtime-reader-summary-topic-labeler-runtime-settings";
export type {
  AgentRuntimeReaderSummaryTopicLabelerOptions,
} from "./agent-runtime-reader-summary-topic-labeler-runtime-settings";

export class AgentRuntimeReaderSummaryTopicLabeler implements ReaderSummaryTopicLabelerPort {
  private readonly client: AgentRuntimeClientPort;
  private readonly settings: AgentRuntimeTopicLabelerSettings;
  private readonly verifiedAttestationSink?: VerifiedReaderSummaryExecutionAttestationSink;

  constructor(options: AgentRuntimeReaderSummaryTopicLabelerOptions) {
    this.client = options.client;
    this.settings = resolveAgentRuntimeTopicLabelerSettings(options);
    this.verifiedAttestationSink = options.verifiedAttestationSink;
  }

  async label(
    input: ReaderSummaryTopicLabelerInput,
    attemptContext: ReaderSummaryTopicMapAttemptContext = defaultAttemptContext,
  ): Promise<ReaderSummaryTopicLabelPlan> {
    const candidates = selectAgentRuntimeReaderSummaryTopicCandidates(
      input,
      this.settings.maxCandidates,
    );
    const command = buildAgentRuntimeTopicLabelCommand({
      input,
      candidates,
      attemptContext,
      agentProvider: this.settings.agentProvider,
      providerInstanceId: this.settings.providerInstanceId,
      model: this.settings.model,
      modelBackend: this.settings.modelBackend,
      reasoningEffort: this.settings.reasoningEffort,
      promptVersion: this.settings.promptVersion,
      timeoutMs: this.settings.timeoutMs,
      maxOutputTokens: this.settings.maxOutputTokens,
    });
    return executeAgentRuntimeTopicLabeling({
      client: this.client,
      command,
      candidates,
      attemptContext,
      modelBackend: this.settings.modelBackend,
      sink: this.verifiedAttestationSink,
    });
  }
}

const defaultAttemptContext: ReaderSummaryTopicMapAttemptContext = {
  attemptNumber: 1,
  totalAttempts: 1,
};

export { resolveAgentRuntimeReaderSummaryTopicLabelerOptions } from "./agent-runtime-reader-summary-topic-labeler-options";
