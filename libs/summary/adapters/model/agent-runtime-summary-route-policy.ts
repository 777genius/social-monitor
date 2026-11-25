import type {
  SummaryModelBudget,
  SummaryModelInput,
  SummaryModelPolicy,
  SummaryModelRoute,
} from "../../ports";
import type { AgentRuntimeSummaryRuntimeSettings } from "./agent-runtime-summary-runtime-settings";
import {
  assertAgentRuntimeSummaryWithinBudget,
  estimateAgentRuntimeSummaryUsage,
} from "./agent-runtime-summary-budget-policy";

type SummaryRouteSettings = Pick<
  AgentRuntimeSummaryRuntimeSettings,
  "agentProvider" | "model" | "promptVersion" | "inputTokenDivisor" | "maxOutputTokens"
>;

/** Pure route identity independent of the agent transport and SDK invocation. */
export const buildAgentRuntimeSummaryRoute = (
  settings: SummaryRouteSettings,
): SummaryModelRoute => ({
  provider: "agent-runtime",
  model: `${settings.agentProvider}:${settings.model}`,
  promptVersion: settings.promptVersion,
  schemaVersion: "summary.artifact.v1",
});

/** Admit the same route and token estimate the adapter will execute. */
export const admitAgentRuntimeSummaryRoute = (params: Readonly<{
  input: SummaryModelInput;
  policy: SummaryModelPolicy;
  budget: SummaryModelBudget;
  settings: SummaryRouteSettings;
}>): SummaryModelRoute => {
  const route = buildAgentRuntimeSummaryRoute(params.settings);
  const estimate = estimateAgentRuntimeSummaryUsage(
    params.input,
    params.settings.inputTokenDivisor,
    params.settings.maxOutputTokens,
  );
  assertAgentRuntimeSummaryWithinBudget(estimate, params.policy, params.budget);
  return route;
};
