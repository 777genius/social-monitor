import type {
  AgentRuntimeClientPort,
  AgentRuntimeTaskCommand,
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelBudget,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelInput,
  ReaderSummaryModelRoute,
} from "../../ports";
import { extractReaderSummaryGatewaySchemaViolations } from "./agent-runtime-reader-summary-gateway-violations";
import {
  assertReaderSummaryRepairWithinBudget,
  sumReaderSummaryUsage,
  usageFromAgentRuntime,
} from "./agent-runtime-model-support";
import { readAttestedAgentRuntimeReaderSummaryDraft } from "./agent-runtime-reader-summary-attested-draft";
import { isRepairableNarrativeError } from "./reader-summary-narrative-repair-contract";
import { readerSummaryDailyInputReceipt } from "./reader-summary-daily-input-receipt";
import type { VerifiedReaderSummaryExecutionAttestationSink } from "./reader-summary-execution-attestation";

export const readerSummaryNarrativeAttempts = ["primary", "repair"] as const;

/** Owns only the bounded primary/repair execution lifecycle. */
export const runAgentRuntimeReaderSummaryGeneration = async (params: Readonly<{
  client: AgentRuntimeClientPort;
  input: ReaderSummaryModelInput;
  selectedRoute: ReaderSummaryModelRoute;
  writerBudget: ReaderSummaryModelBudget | undefined;
  buildTaskCommand: (
    attempt: "primary" | "repair",
    schemaViolations?: readonly string[],
  ) => AgentRuntimeTaskCommand;
  estimate: () => ReaderSummaryModelEstimate;
  evalDatasetVersion: string;
  legacyRecovery: boolean;
  verifiedAttestationSink: VerifiedReaderSummaryExecutionAttestationSink | undefined;
}>): Promise<ProviderReaderSummaryAttempt> => {
  const { input, selectedRoute } = params;
  let logicalRunUsage: ReaderSummaryModelEstimate | undefined;
  let schemaViolations: readonly string[] | undefined;
  // Two attempts at most: the repair runs once, for either cause.
  for (const attempt of readerSummaryNarrativeAttempts) {
    const command = params.buildTaskCommand(attempt, schemaViolations);
    const dailyGenerationReceipt = readerSummaryDailyInputReceipt(command.prompt, input.evidence.dailyGenerationInput, input.dailyEditorialPlan);
    const result = await params.client.runTask(command);
    const estimate = params.estimate();
    const attemptUsage = usageFromAgentRuntime(result.usage, estimate);
    logicalRunUsage = sumReaderSummaryUsage(logicalRunUsage, attemptUsage);
    if (attempt === "primary") {
      schemaViolations = extractReaderSummaryGatewaySchemaViolations(result);
      if (schemaViolations !== undefined) {
        assertReaderSummaryRepairWithinBudget(logicalRunUsage, estimate, params.writerBudget);
        continue;
      }
    }
    try {
      const draft = await readAttestedAgentRuntimeReaderSummaryDraft({
        command,
        result,
        input,
        selectedRoute,
        logicalRunUsage,
        evalDatasetVersion: params.evalDatasetVersion,
        legacyRecovery: params.legacyRecovery,
        attempt,
        sink: params.verifiedAttestationSink,
      });

      return { route: selectedRoute, draft, ...(dailyGenerationReceipt === undefined ? {} : { dailyGenerationReceipt }) };
    } catch (error) {
      if (attempt === "primary" && isRepairableNarrativeError(error)) {
        assertReaderSummaryRepairWithinBudget(logicalRunUsage, estimate, params.writerBudget);
        continue;
      }
      throw error;
    }
  }

  throw new Error("Reader summary repair attempt did not return a result");
};
