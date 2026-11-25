import type { ReaderSummaryTopicLabelPlan } from "../../domain";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeTaskCommand,
  ReaderSummaryTopicLabelerInput,
  ReaderSummaryTopicMapAttemptContext,
} from "../../ports";
import { readAgentRuntimeObjectOutput } from "./agent-runtime-model-support";
import { assertMimoTopicLabelSchema } from "./agent-runtime-reader-summary-topic-label-schema";
import {
  normalizeAgentRuntimeReaderSummaryTopicLabelPlan,
  parseAgentRuntimeReaderSummaryTopicLabelerJsonObject,
} from "./agent-runtime-reader-summary-topic-label-plan-normalizer";
import {
  mimoReaderSummaryBackend,
  verifyAndRecordMimoDailyExecution,
  type ReaderSummaryGenerationBackend,
} from "./active-reader-summary-generation-profile";
import {
  verifyAndRecordReaderSummaryExecution,
  type VerifiedReaderSummaryExecutionAttestationSink,
} from "./reader-summary-execution-attestation";

/** Decode and verify the provider's topic-label decision before it can be returned. */
export const executeAgentRuntimeTopicLabeling = async (params: Readonly<{
  client: AgentRuntimeClientPort;
  command: AgentRuntimeTaskCommand;
  candidates: readonly ReaderSummaryTopicLabelerInput["candidates"][number][];
  attemptContext: ReaderSummaryTopicMapAttemptContext;
  modelBackend: ReaderSummaryGenerationBackend;
  sink?: VerifiedReaderSummaryExecutionAttestationSink;
}>): Promise<ReaderSummaryTopicLabelPlan> => {
  const { client, command, candidates, attemptContext, modelBackend, sink } = params;
  const result = await client.runTask(command);
  const raw = readAgentRuntimeObjectOutput(
    result,
    parseAgentRuntimeReaderSummaryTopicLabelerJsonObject,
    "Reader summary topic map",
  );
  if (modelBackend === mimoReaderSummaryBackend) {
    assertMimoTopicLabelSchema(raw);
  }

  const plan = normalizeAgentRuntimeReaderSummaryTopicLabelPlan(
    raw,
    candidates,
  );
  await (modelBackend === mimoReaderSummaryBackend
    ? verifyAndRecordMimoDailyExecution
    : verifyAndRecordReaderSummaryExecution)({
    command,
    result,
    taskRole: "topic_label",
    attempt: String(attemptContext.attemptNumber),
    normalizedOutput: plan,
    sink,
  });
  return plan;
};
