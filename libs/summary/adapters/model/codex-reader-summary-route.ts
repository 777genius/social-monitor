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
import { parseCodexGatewayReaderSummaryRoute } from "./codex-reader-summary-gateway-env-admission";
import {
  codexReaderSummaryBackend,
  readerSummaryGatewayTransport,
  type CodexReaderSummaryRoute,
} from "./codex-reader-summary-gateway-route-policy";

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
