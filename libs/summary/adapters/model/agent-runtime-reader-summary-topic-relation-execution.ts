import type { ReaderSummaryTopicRelationDecision } from "../../domain";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeTaskCommand,
  ReaderSummaryTopicMapAttemptContext,
  ReaderSummaryTopicRelationVerifierInput,
} from "../../ports";
import { readAgentRuntimeObjectOutput } from "./agent-runtime-model-support";
import { normalizeDecisions, parseJsonObject } from "./agent-runtime-reader-summary-topic-relation-decisions";
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
 * Owns provider response admission and execution-attestation recording.
 * Only a fully validated and recorded decision can return to the adapter;
 * request configuration and tenant-scoped command creation stay outside.
 */
export const executeAgentRuntimeTopicRelationVerification = async (
  params: Readonly<{
    client: AgentRuntimeClientPort;
    command: AgentRuntimeTaskCommand;
    input: ReaderSummaryTopicRelationVerifierInput;
    attemptContext: ReaderSummaryTopicMapAttemptContext;
    modelBackend: ReaderSummaryGenerationBackend;
    sink?: VerifiedReaderSummaryExecutionAttestationSink;
  }>,
): Promise<readonly ReaderSummaryTopicRelationDecision[]> => {
  const { client, command, input, attemptContext, modelBackend, sink } = params;
  const result = await client.runTask(command);
  const raw = readAgentRuntimeObjectOutput(
    result,
    parseJsonObject,
    "Reader summary topic relation verifier",
  );
  if (modelBackend === mimoReaderSummaryBackend) {
    assertStoryRelationResponseSchema(raw, command.outputSchema);
  }

  const decisions = normalizeDecisions(raw, input.relations);
  await (modelBackend === mimoReaderSummaryBackend
    ? verifyAndRecordMimoDailyExecution
    : verifyAndRecordReaderSummaryExecution)({
    command,
    result,
    taskRole: "topic_relation",
    attempt: String(attemptContext.attemptNumber),
    normalizedOutput: decisions,
    sink,
  });
  return decisions;
};
