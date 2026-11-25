import { admitGatewayReaderSummaryRoute } from "./reader-summary-gateway-route-admission";
import { type codexReaderSummaryBackend } from "./codex-reader-summary-route";
import { type mimoReaderSummaryBackend } from "./reader-summary-runtime-contract";
import {
  isGatewayReaderSummaryBackend,
  type GatewayReaderSummaryBackend,
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

export type { GatewayReaderSummaryBackend } from "./reader-summary-gateway-model-policy";

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
  return admitGatewayReaderSummaryRoute(backend, model, effort);
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

