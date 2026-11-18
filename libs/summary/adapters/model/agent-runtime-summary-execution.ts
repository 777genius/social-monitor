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
import { interpretAgentRuntimeSummaryTaskResult } from "./agent-runtime-summary-result-interpretation";

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
  const taskResult = await client.runTask(command);
  return interpretAgentRuntimeSummaryTaskResult({
    result: taskResult,
    input,
    selectedRoute,
    evalDatasetVersion: settings.evalDatasetVersion,
    estimateUsage,
  });
};
