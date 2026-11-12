import type {
  AgentRuntimeClientPort,
  ProviderSummaryAttempt,
  SummaryModelEstimate,
  SummaryModelInput,
  SummaryModelRoute,
} from "../../ports";
import { buildAgentRuntimeSummaryTaskCommand } from "./agent-runtime-summary-task-command";
import { defaultAgentRuntimeSummaryModel } from "./agent-runtime-summary-options";
import type { AgentRuntimeSummaryRuntimeSettings } from "./agent-runtime-summary-runtime-settings";
import {
  readAgentRuntimeObjectOutput,
  usageFromAgentRuntime,
} from "./agent-runtime-model-support";
import { parseOpenAiSummaryJsonObject } from "./openai-responses-summary-response-parser";
import { normalizeOpenAiSummaryDraft } from "./openai-responses-summary-draft-normalizer";

/**
 * Own the effectful summary request and strict provider-result interpretation.
 * Routing, budgets, and no-signal fallback remain at the model-port adapter.
 */
export const runAgentRuntimeSummaryExecution = async ({
  client,
  input,
  selectedRoute,
  settings,
  estimateUsage,
}: {
  readonly client: AgentRuntimeClientPort;
  readonly input: SummaryModelInput;
  readonly selectedRoute: SummaryModelRoute;
  readonly settings: AgentRuntimeSummaryRuntimeSettings;
  readonly estimateUsage: () => SummaryModelEstimate;
}): Promise<ProviderSummaryAttempt> => {
  const command = buildAgentRuntimeSummaryTaskCommand({
    input,
    selectedRoute,
    agentProvider: settings.agentProvider,
    providerInstanceId: settings.providerInstanceId,
    model: settings.model,
    defaultModelAlias: defaultAgentRuntimeSummaryModel,
    routeControls: settings.routeControls,
    maxOutputTokens: settings.maxOutputTokens,
    timeoutMs: settings.timeoutMs,
  });
  const result = await client.runTask(command);
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
    settings.evalDatasetVersion,
  );

  return {
    route: selectedRoute,
    draft,
  };
};
