import {
  type codexReaderSummaryBackend,
  isCodexGatewayOnlyReaderSummaryModel,
} from "./codex-reader-summary-route";
import { type mimoReaderSummaryBackend } from "./reader-summary-runtime-contract";
import {
  kimiCodeReaderSummaryBackend,
  openRouterReaderSummaryBackend,
  kimiCodeReaderSummaryModel,
  defaultOpenRouterReaderSummaryModel,
  gatewayDefaultReasoningEffort,
  gatewayEfforts,
  isGatewayReaderSummaryBackend,
  isGatewayReaderSummaryModel,
} from "./reader-summary-gateway-model-policy";

export {
  kimiCodeReaderSummaryBackend,
  openRouterReaderSummaryBackend,
  kimiCodeReaderSummaryModel,
  defaultOpenRouterReaderSummaryModel,
  gatewayDefaultReasoningEffort,
  isGatewayReaderSummaryBackend,
  isGatewayReaderSummaryModel,
  isGatewayReaderSummaryReasoningEffort,
} from "./reader-summary-gateway-model-policy";
export { isGatewayReaderSummaryExecution } from "./reader-summary-gateway-execution-policy";

export type GatewayReaderSummaryBackend =
  | typeof kimiCodeReaderSummaryBackend
  | typeof openRouterReaderSummaryBackend;

export type ReaderSummaryGenerationBackend =
  | typeof codexReaderSummaryBackend
  | typeof mimoReaderSummaryBackend
  | GatewayReaderSummaryBackend;

/** Model and reasoning policy of the one gateway route used by a run. */
export type GatewayReaderSummaryRoute = {
  readonly backend: GatewayReaderSummaryBackend;
  readonly model: string;
  /** gatewayDefaultReasoningEffort, or an effort the route sends explicitly. */
  readonly reasoningEffort: string;
};

/**
 * The gateway route selected by AGENT_RUNTIME_READER_SUMMARY_BACKEND, or
 * undefined for a CLI backend. Kimi Code is pinned to its one model without
 * reasoning; OpenRouter takes any catalog model and an optional effort.
 */
export const resolveGatewayReaderSummaryRoute = (
  env: NodeJS.ProcessEnv,
): GatewayReaderSummaryRoute | undefined => {
  const backend = env.AGENT_RUNTIME_READER_SUMMARY_BACKEND?.trim();
  if (!isGatewayReaderSummaryBackend(backend)) return undefined;
  const model = env.AGENT_RUNTIME_GATEWAY_LLM_MODEL?.trim() || undefined;
  const effort = env.AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT?.trim() || undefined;
  if (backend === kimiCodeReaderSummaryBackend) {
    if (model !== undefined && model !== kimiCodeReaderSummaryModel) {
      throw new Error("AGENT_RUNTIME_GATEWAY_LLM_MODEL must be k3-256k for kimi-code");
    }
    if (effort !== undefined) {
      throw new Error("kimi-code rejects reasoning control; unset AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT");
    }
    return { backend, model: kimiCodeReaderSummaryModel,
      reasoningEffort: gatewayDefaultReasoningEffort };
  }
  const selected = model ?? defaultOpenRouterReaderSummaryModel;
  // Codex model names keep the Codex profile and their allowed efforts.
  if (!isGatewayReaderSummaryModel(selected) || isCodexGatewayOnlyReaderSummaryModel(selected)) {
    throw new Error("AGENT_RUNTIME_GATEWAY_LLM_MODEL is not a gateway model id");
  }
  if (effort !== undefined && !gatewayEfforts.has(effort)) {
    throw new Error("AGENT_RUNTIME_GATEWAY_LLM_REASONING_EFFORT is not a supported effort");
  }
  return { backend, model: selected,
    reasoningEffort: effort ?? gatewayDefaultReasoningEffort };
};

/** Purpose-specific model overrides must name the gateway model or stay unset. */
export const gatewayRouteModel = (
  route: { readonly model: string },
  purposeModel: string | undefined,
): string => {
  if (purposeModel !== undefined && purposeModel.trim() !== "" &&
    purposeModel.trim() !== route.model) {
    throw new Error("Gateway reader summary model conflicts with purpose policy");
  }
  return route.model;
};

