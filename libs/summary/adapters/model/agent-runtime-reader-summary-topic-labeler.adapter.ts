import { buildAgentRuntimeTopicLabelCommand } from "./agent-runtime-reader-summary-topic-label-command";
import { assertMimoTopicLabelSchema } from "./agent-runtime-reader-summary-topic-label-schema";
import type { ReaderSummaryTopicLabelPlan } from "../../domain";
import type {
  AgentRuntimeClientPort,
  ReaderSummaryTopicLabelerInput,
  ReaderSummaryTopicLabelerPort,
  ReaderSummaryTopicMapAttemptContext,
} from "../../ports";
import { readAgentRuntimeObjectOutput } from "./agent-runtime-model-support";
import {
  normalizeAgentRuntimeReaderSummaryTopicLabelPlan,
  parseAgentRuntimeReaderSummaryTopicLabelerJsonObject,
} from "./agent-runtime-reader-summary-topic-label-plan-normalizer";
import { selectAgentRuntimeReaderSummaryTopicCandidates } from "./agent-runtime-reader-summary-topic-labeler-prompt";
import {
  verifyAndRecordReaderSummaryExecution,
  type VerifiedReaderSummaryExecutionAttestationSink,
} from "./reader-summary-execution-attestation";
import {
  mimoReaderSummaryBackend,
  verifyAndRecordMimoDailyExecution,
} from "./active-reader-summary-generation-profile";
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
    const result = await this.client.runTask(command);
    const raw = readAgentRuntimeObjectOutput(
      result,
      parseAgentRuntimeReaderSummaryTopicLabelerJsonObject,
      "Reader summary topic map",
    );
    if (this.settings.modelBackend === mimoReaderSummaryBackend) {
      assertMimoTopicLabelSchema(raw);
    }

    const plan = normalizeAgentRuntimeReaderSummaryTopicLabelPlan(
      raw,
      candidates,
    );
    await (this.settings.modelBackend === mimoReaderSummaryBackend
      ? verifyAndRecordMimoDailyExecution
      : verifyAndRecordReaderSummaryExecution)({
      command,
      result,
      taskRole: "topic_label",
      attempt: String(attemptContext.attemptNumber),
      normalizedOutput: plan,
      sink: this.verifiedAttestationSink,
    });
    return plan;
  }
}

const defaultAttemptContext: ReaderSummaryTopicMapAttemptContext = {
  attemptNumber: 1,
  totalAttempts: 1,
};

export { resolveAgentRuntimeReaderSummaryTopicLabelerOptions } from "./agent-runtime-reader-summary-topic-labeler-options";
