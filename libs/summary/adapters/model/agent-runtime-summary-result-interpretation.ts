import type {
  AgentRuntimeTaskResult,
  ProviderSummaryAttempt,
  SummaryModelEstimate,
  SummaryModelInput,
  SummaryModelRoute,
} from "../../ports";
import {
  readAgentRuntimeObjectOutput,
  usageFromAgentRuntime,
} from "./agent-runtime-model-support";
import { parseOpenAiSummaryJsonObject } from "./openai-responses-summary-response-parser";
import { normalizeOpenAiSummaryDraft } from "./openai-responses-summary-draft-normalizer";

/**
 * Interpret one untrusted task result after paid transport has settled.
 * Reject refused or malformed output before estimating usage and publication.
 * Transport, route, and retry decisions stay with their original owners.
 */
export const interpretAgentRuntimeSummaryTaskResult = ({
  result,
  input,
  selectedRoute,
  evalDatasetVersion,
  estimateUsage,
}: {
  readonly result: AgentRuntimeTaskResult;
  readonly input: SummaryModelInput;
  readonly selectedRoute: SummaryModelRoute;
  readonly evalDatasetVersion: string;
  readonly estimateUsage: () => SummaryModelEstimate;
}): ProviderSummaryAttempt => {
  const rawDraft = readAgentRuntimeObjectOutput(
    result,
    parseOpenAiSummaryJsonObject,
    "Summary",
  );
  const usage = usageFromAgentRuntime(
    result.usage,
    estimateUsage(),
  );
  const draft = normalizeOpenAiSummaryDraft(
    rawDraft,
    input,
    selectedRoute,
    usage,
    evalDatasetVersion,
  );

  return {
    route: selectedRoute,
    draft,
  };
};
