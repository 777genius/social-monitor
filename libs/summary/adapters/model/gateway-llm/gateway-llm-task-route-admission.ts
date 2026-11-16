import type { AgentRuntimeFailure, AgentRuntimeTaskCommand } from "../../../ports";
import { codexReaderSummaryBackend } from "../active-reader-summary-generation-profile";
import type { GatewayLlmRoute } from "./gateway-llm-client";
import { gatewayLlmLocalFailure } from "./gateway-llm-failure";

/** Fail closed before SDK schema parsing, account choice or any paid dispatch.
 * Order: exact backend/model, effort, then prompt and deadline.
 */
export const admitGatewayLlmTaskRoute = (
  command: Pick<AgentRuntimeTaskCommand, "controls" | "systemPrompt" | "timeoutMs">,
  route: Pick<GatewayLlmRoute, "model" | "modelBackend" | "reasoningEffort">,
): { readonly failure: AgentRuntimeFailure } | null => {
  const controls = command.controls;
  // Codex tasks name no modelBackend; every other backend names itself.
  if (controls.model !== route.model ||
      (controls.modelBackend ?? codexReaderSummaryBackend) !== route.modelBackend) {
    return { failure: gatewayLlmLocalFailure("unsupported_route",
      "Gateway has no route for the requested model") };
  }
  if (controls.reasoningEffort !== route.reasoningEffort) {
    return { failure: gatewayLlmLocalFailure("invalid_request",
      "Gateway task reasoning effort conflicts with the route policy") };
  }
  if (command.systemPrompt.trim().length === 0 || !(command.timeoutMs > 0)) {
    return { failure: gatewayLlmLocalFailure("invalid_request",
      "Gateway task requires instructions and a positive timeout") };
  }
  return null;
};
