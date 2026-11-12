import { buildAgentRuntimeStoryRelationCommand } from "./agent-runtime-reader-summary-story-relation-command";
import { executeAgentRuntimeStoryRelationVerification } from "./agent-runtime-reader-summary-story-relation-execution";
import type {
  AgentRuntimeClientPort,
  ReaderSummaryStoryRelationVerifierInput,
  ReaderSummaryStoryRelationVerifierPort,
} from "../../ports";

import {
  resolveStoryRelationVerifierConfig,
  type AgentRuntimeReaderSummaryStoryRelationVerifierOptions,
} from "./agent-runtime-reader-summary-story-relation-options";
import type { VerifiedReaderSummaryExecutionAttestationSink } from "./reader-summary-execution-attestation";
import type { ReaderSummaryGenerationBackend } from "./active-reader-summary-generation-profile";


export type { AgentRuntimeReaderSummaryStoryRelationVerifierOptions } from "./agent-runtime-reader-summary-story-relation-options";
export { resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions } from "./agent-runtime-reader-summary-story-relation-options";

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
    const config = resolveStoryRelationVerifierConfig(options);
    this.provider = config.provider;
    this.providerInstanceId = options.providerInstanceId;
    this.model = config.model;
    this.modelBackend = config.modelBackend;
    this.reasoningEffort = config.reasoningEffort;
    this.promptVersion = config.promptVersion;
    this.relatedTopicPromptVersion = config.relatedTopicPromptVersion;
    this.timeoutMs = config.timeoutMs;
    this.maxOutputTokens = config.maxOutputTokens;
    this.relatedTopicTimeoutMs = config.relatedTopicTimeoutMs;
    this.verifiedAttestationSink = options.verifiedAttestationSink;
  }

  async verify(
    input: ReaderSummaryStoryRelationVerifierInput,
  ): Promise<readonly unknown[]> {
    if (input.candidates.length === 0) {
      return [];
    }
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
    return executeAgentRuntimeStoryRelationVerification({
      client: this.client,
      input,
      command,
      modelBackend: this.modelBackend,
      sink: this.verifiedAttestationSink,
    });
  }
}

