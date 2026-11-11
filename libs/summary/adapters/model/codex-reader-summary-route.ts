// Keep the historical direct-import surface while separating the immutable
// Codex model/effort catalog from environment-based transport selection.
export {
  codexReaderSummaryBackend,
  activeReaderSummaryModel,
  activeReaderSummaryReasoningEffort,
  readerSummaryGatewayTransport,
  defaultCodexGatewayReaderSummaryRoute,
  codexGatewayReaderSummaryRoutes,
  isCodexGatewayReaderSummaryRoute,
  isCodexGatewayOnlyReaderSummaryModel,
  codexGatewayReaderSummaryReasoningEffort,
  type CodexReaderSummaryRoute,
} from "./codex-reader-summary-gateway-route-policy";
import {
  codexReaderSummaryBackend,
  readerSummaryGatewayTransport,
  defaultCodexGatewayReaderSummaryRoute,
  codexGatewayReaderSummaryRoutes,
  codexGatewayReaderSummaryReasoningEffort,
  type CodexReaderSummaryRoute,
} from "./codex-reader-summary-gateway-route-policy";

/**
 * Codex route of AGENT_RUNTIME_READER_SUMMARY_BACKEND=openai-chatgpt on the
 * gateway transport. AGENT_RUNTIME_GATEWAY_LLM_MODEL and _REASONING_EFFORT
 * select one allowed pair; an unset effort takes the model's first allowed
 * effort and an unset model the default route.
 */
const parseCodexGatewayReaderSummaryRoute = (
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

/**
 * Settings of a run that executes only on the gRPC CLI runtime: its Codex
 * identity stays the CLI one even where the process selects the gateway.
 */
export const readerSummaryCliRuntimeEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  ({ ...env, AGENT_RUNTIME_TRANSPORT: "agent-runtime" });

/** The Codex gateway route when openai-chatgpt runs on the gateway transport. */
export const resolveCodexGatewayReaderSummaryRoute = (
  env: NodeJS.ProcessEnv,
): CodexReaderSummaryRoute | undefined =>
  env.AGENT_RUNTIME_TRANSPORT?.trim() === readerSummaryGatewayTransport &&
  env.AGENT_RUNTIME_READER_SUMMARY_BACKEND?.trim() === codexReaderSummaryBackend
    ? parseCodexGatewayReaderSummaryRoute(env)
    : undefined;
