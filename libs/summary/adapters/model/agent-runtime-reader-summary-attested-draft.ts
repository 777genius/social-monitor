import type {
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelInput,
  ReaderSummaryModelRoute,
} from "../../ports";
import { frozenLegacyReaderSummaryRecoveryContract } from "./active-reader-summary-generation-profile";
import {
  readAgentRuntimeObjectOutput,
} from "./agent-runtime-model-support";
import { normalizeOpenAiReaderSummaryDraft } from "./openai-responses-reader-summary-draft-normalizer";
import { parseOpenAiReaderSummaryJsonObject } from "./openai-responses-reader-summary-response-parser";
import {
  verifyAndRecordReaderSummaryExecution,
  type VerifiedReaderSummaryExecutionAttestationSink,
} from "./reader-summary-execution-attestation";

/**
 * Provider bytes cannot become a published draft until strict normalization
 * AND the scoped runtime execution attestation have both been accepted.
 * Repair scheduling and budget accounting belong to the caller.
 */
export const readAttestedAgentRuntimeReaderSummaryDraft = async (params: Readonly<{
  command: AgentRuntimeTaskCommand;
  result: AgentRuntimeTaskResult;
  input: ReaderSummaryModelInput;
  selectedRoute: ReaderSummaryModelRoute;
  logicalRunUsage: ReaderSummaryModelEstimate;
  evalDatasetVersion: string;
  legacyRecovery: boolean;
  attempt: "primary" | "repair";
  sink: VerifiedReaderSummaryExecutionAttestationSink | undefined;
}>): Promise<ProviderReaderSummaryAttempt["draft"]> => {
  const {
    command, result, input, selectedRoute, logicalRunUsage,
    evalDatasetVersion, legacyRecovery, attempt, sink,
  } = params;
  const rawDraft = readAgentRuntimeObjectOutput(
    result,
    parseOpenAiReaderSummaryJsonObject,
    "Reader summary",
  );
  const draft = normalizeOpenAiReaderSummaryDraft(
    rawDraft,
    input,
    selectedRoute,
    logicalRunUsage,
    evalDatasetVersion,
  );
  await verifyAndRecordReaderSummaryExecution({
    command,
    result,
    taskRole: "summary",
    attempt,
    normalizedOutput: draft,
    legacyRecoveryContract: legacyRecovery
      ? frozenLegacyReaderSummaryRecoveryContract
      : undefined,
    sink,
  });
  return draft;
};
