import {
  codexReaderSummaryBackend,
  defaultCodexGatewayReaderSummaryRoute,
  codexGatewayReaderSummaryRoutes,
  codexGatewayReaderSummaryReasoningEffort,
  type CodexReaderSummaryRoute,
} from "./codex-reader-summary-gateway-route-policy";

/** Validate only the selected gateway model/effort pair; transport gating is separate. */
/**
 * Codex route of AGENT_RUNTIME_READER_SUMMARY_BACKEND=openai-chatgpt on the
 * gateway transport. AGENT_RUNTIME_GATEWAY_LLM_MODEL and _REASONING_EFFORT
 * select one allowed pair; an unset effort takes the model's first allowed
 * effort and an unset model the default route.
 */
export const parseCodexGatewayReaderSummaryRoute = (
  env: NodeJS.ProcessEnv,
): CodexReaderSummaryRoute => {
  const model = env.AGENT_RUNTIME_GATEWAY_LLM_MODEL?.trim() || defaultCodexGatewayReaderSummaryRoute.model;
  const effort = env.AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT?.trim() ||
    codexGatewayReaderSummaryReasoningEffort(model);
  const route = codexGatewayReaderSummaryRoutes.find((candidate) =>
    candidate.model === model && candidate.reasoningEffort === effort);
  if (route === undefined) {
    throw new Error(`AGENT_RUNTIME_GATEWAY_LLM_MODEL and _REASONING_EFFORT must be one of ${
      codexGatewayReaderSummaryRoutes.map((candidate) =>
        `${candidate.model}/${candidate.reasoningEffort}`).join(", ")} for ${codexReaderSummaryBackend}`);
  }
  return route;
};
