import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type { AgentRuntimeTaskCommand } from "../../../ports";
import type { GatewayLlmRoute } from "./gateway-llm-client";
import { gatewayLlmOutputBytes } from "./gateway-llm-output-budget";

/** Stable model input identity, distinct from the SDK's native wire request hash. */
export const gatewayLlmCanonicalRequest = (command: AgentRuntimeTaskCommand,
  route: Pick<GatewayLlmRoute, "profileId" | "model" | "reasoningEffort" | "minOutputTokens">): Record<string, unknown> => {
  const requested = command.controls.maxOutputTokens;
  return ({
  purpose: command.purpose, provider: command.provider,
  profileId: route.profileId, model: route.model,
  reasoningEffort: route.reasoningEffort ?? "default",
  outputBytes: gatewayLlmOutputBytes(command.purpose),
  maxOutputTokens: Math.max(route.minOutputTokens,
    typeof requested === "number" && Number.isSafeInteger(requested) && requested > 0
      ? requested : 0),
  systemPrompt: command.systemPrompt, prompt: command.prompt, outputSchema: command.outputSchema,
  });
};
export const gatewayLlmCanonicalRequestSha256 = (command: AgentRuntimeTaskCommand,
  route: Parameters<typeof gatewayLlmCanonicalRequest>[1]): string =>
  canonicalJsonSha256(gatewayLlmCanonicalRequest(command, route));
