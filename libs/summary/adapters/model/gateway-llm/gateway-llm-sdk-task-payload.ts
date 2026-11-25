import type { LlmTask } from "@agent-teams/account-gateway/llm";

import type { AgentRuntimeTaskCommand } from "../../../ports";
import type { GatewayLlmClientOptions, GatewayLlmRoute } from "./gateway-llm-client-contract";
import { gatewayLlmDeadline } from "./gateway-llm-deadline";
import { gatewayLlmMaxOutputTokens, gatewayLlmOutputBytes } from "./gateway-llm-output-budget";
import type { GatewayLlmPreparedOutput } from "./gateway-llm-structured-output";

type PreparedSdkTask = Omit<LlmTask<Record<string, unknown>>, "taskId" | "attempt" | "accountRefs">;

/** Pure SDK request projection after route and strict-output admission.
 * Account order and paid attempt identity are bound only at dispatch.
 */
export const gatewayLlmSdkTaskPayload = (
  command: AgentRuntimeTaskCommand,
  startedAt: number,
  route: GatewayLlmRoute,
  policy: GatewayLlmClientOptions["policy"],
  preparedOutput: GatewayLlmPreparedOutput,
): PreparedSdkTask => ({
  profileId: route.profileId,
  model: route.model,
  policy,
  instructions: command.systemPrompt,
  input: command.prompt,
  output: preparedOutput.output,
  ...(route.reasoningEffort === undefined ? {} : { effort: route.reasoningEffort }),
  maxOutputTokens: gatewayLlmMaxOutputTokens(route.minOutputTokens, command.controls.maxOutputTokens),
  limits: { outputBytes: gatewayLlmOutputBytes(command.purpose) },
  deadline: gatewayLlmDeadline(startedAt, command.timeoutMs),
  ...(preparedOutput.decode === undefined ? {} : { decode: preparedOutput.decode }),
});
