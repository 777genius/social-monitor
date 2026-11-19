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


export type { AgentRuntimeReaderSummaryStoryRelationVerifierOptions } from "./agent-runtime-reader-summary-story-relation-options";
export { resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions } from "./agent-runtime-reader-summary-story-relation-options";

export class AgentRuntimeReaderSummaryStoryRelationVerifier implements ReaderSummaryStoryRelationVerifierPort {
  private readonly client: AgentRuntimeClientPort;
  private readonly config: ReturnType<typeof resolveStoryRelationVerifierConfig>;
  private readonly providerInstanceId?: string;
  private readonly verifiedAttestationSink?: VerifiedReaderSummaryExecutionAttestationSink;

  constructor(options: AgentRuntimeReaderSummaryStoryRelationVerifierOptions) {
    this.client = options.client;
    this.config = resolveStoryRelationVerifierConfig(options);
    this.providerInstanceId = options.providerInstanceId;
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
      ...this.config,
      providerInstanceId: this.providerInstanceId,
    });
    return executeAgentRuntimeStoryRelationVerification({
      client: this.client,
      input,
      command,
      modelBackend: this.config.modelBackend,
      sink: this.verifiedAttestationSink,
    });
  }
}

