import type {
  AgentRuntimeClientPort,
  AgentRuntimeTaskCommand,
  ReaderSummaryStoryRelationVerifierInput,
} from "../../ports";
import { readAgentRuntimeObjectOutput } from "./agent-runtime-model-support";
import {
  normalizeBinaryDecisions,
  parseJsonObject,
  readDecisionEnvelope,
} from "./agent-runtime-reader-summary-story-relation-decoder";
import {
  mimoReaderSummaryBackend,
  type ReaderSummaryGenerationBackend,
  verifyAndRecordMimoDailyExecution,
} from "./active-reader-summary-generation-profile";
import {
  verifyAndRecordReaderSummaryExecution,
  type VerifiedReaderSummaryExecutionAttestationSink,
} from "./reader-summary-execution-attestation";
import { assertStoryRelationResponseSchema } from "./story-relation-response-schema";

/**
 * Executes the provider-specific story relation trust boundary. Reject output
 * before any execution receipt is recorded; the shadow lane has no audit sink.
 * Command building and lane-specific prompts remain with their own owner.
 */
export const executeAgentRuntimeStoryRelationVerification = async (params: Readonly<{
  client: AgentRuntimeClientPort;
  input: ReaderSummaryStoryRelationVerifierInput;
  command: AgentRuntimeTaskCommand;
  modelBackend: ReaderSummaryGenerationBackend;
  sink?: VerifiedReaderSummaryExecutionAttestationSink;
}>): Promise<readonly unknown[]> => {
  const relatedTopicLane = params.input.verificationLane === "related_topic";
  const result = await params.client.runTask(params.command, {
    signal: params.input.signal,
  });
  const raw = readAgentRuntimeObjectOutput(
    result,
    (text) => parseJsonObject(text, params.command.outputSchema),
    "Reader summary story relation verifier",
  );

  assertStoryRelationResponseSchema(raw, params.command.outputSchema);

  const decisions = relatedTopicLane
    ? readDecisionEnvelope(raw)
    : normalizeBinaryDecisions(raw);
  await (params.modelBackend === mimoReaderSummaryBackend
    ? verifyAndRecordMimoDailyExecution
    : verifyAndRecordReaderSummaryExecution)({
    command: params.command,
    result,
    taskRole: relatedTopicLane ? "related_topic_relation" : "story_relation",
    attempt: relatedTopicLane ? "related-topic" : "primary",
    normalizedOutput: decisions,
    sink:
      params.input.verificationLane === "safe_recall_shadow"
        ? undefined
        : params.sink,
  });
  return decisions;
};
