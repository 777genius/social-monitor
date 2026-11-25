import {
  resolveCodexGatewayReaderSummaryRoute,
  type CodexReaderSummaryRoute,
} from "./codex-reader-summary-route";
import {
  resolveGatewayReaderSummaryRoute,
  type GatewayReaderSummaryRoute,
} from "./reader-summary-gateway-route-policy";
import { mimoReaderSummaryBackend } from "./reader-summary-runtime-contract";

// Both daily tasks and generation must reject the same unknown backend.
export const backendMessage =
  "AGENT_RUNTIME_READER_SUMMARY_BACKEND must be openai-chatgpt, xiaomi-mimo-token-plan, kimi-code or openrouter";

export type ReaderSummaryBackendSelection =
  | { readonly kind: "codex-gateway"; readonly route: CodexReaderSummaryRoute }
  | { readonly kind: "cli" }
  | { readonly kind: "gateway"; readonly route: GatewayReaderSummaryRoute }
  | { readonly kind: "mimo" };

/**
 * One transport/backend selector; purpose-specific model admission remains in
 * the two callers. Ignore unselected gateway settings, but reject unsupported
 * backends rather than quietly falling back to the default CLI.
 */
export const resolveReaderSummaryBackendSelectionFromEnv = (
  env: NodeJS.ProcessEnv,
): ReaderSummaryBackendSelection => {
  const backend = env.AGENT_RUNTIME_READER_SUMMARY_BACKEND?.trim();
  const codexGateway = resolveCodexGatewayReaderSummaryRoute(env);
  if (codexGateway !== undefined) {
    return { kind: "codex-gateway", route: codexGateway };
  }
  if (backend === undefined || backend === "" || backend === "openai-chatgpt") {
    return { kind: "cli" };
  }
  const gateway = resolveGatewayReaderSummaryRoute(env);
  if (gateway !== undefined) {
    return { kind: "gateway", route: gateway };
  }
  if (backend !== mimoReaderSummaryBackend) {
    throw new Error(backendMessage);
  }
  return { kind: "mimo" };
};
