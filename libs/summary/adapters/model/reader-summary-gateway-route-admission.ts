import { isCodexGatewayOnlyReaderSummaryModel } from "./codex-reader-summary-route";
import {
  kimiCodeReaderSummaryBackend,
  kimiCodeReaderSummaryModel,
  defaultOpenRouterReaderSummaryModel,
  gatewayDefaultReasoningEffort,
  gatewayEfforts,
  isGatewayReaderSummaryModel,
} from "./reader-summary-gateway-model-policy";
import type { GatewayReaderSummaryRoute } from "./reader-summary-gateway-route-policy";

/** Pure fail-closed gateway model and effort policy, independent of process env. */
export const admitGatewayReaderSummaryRoute = (
  backend: GatewayReaderSummaryRoute["backend"],
  model: string | undefined,
  effort: string | undefined,
): GatewayReaderSummaryRoute => {
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
