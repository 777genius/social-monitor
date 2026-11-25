import type { LlmTask } from "@agent-teams/account-gateway/llm";

import type { AgentRuntimeFailure, AgentRuntimeTaskCommand } from "../../../ports";
import { gatewayDefaultReasoningEffort } from "../reader-summary-gateway-model-policy";
import type { GatewayLlmClientOptions, GatewayLlmRoute } from "./gateway-llm-client-contract";
import type { GatewayLlmOutputViolations } from "./gateway-llm-failure";
import { prepareGatewayLlmOutput } from "./gateway-llm-structured-output";
import { admitGatewayLlmTaskRoute } from "./gateway-llm-task-route-admission";
import { gatewayLlmSdkTaskPayload } from "./gateway-llm-sdk-task-payload";

type PreparedTask = Omit<LlmTask<Record<string, unknown>>, "taskId" | "attempt" | "accountRefs">;
export type GatewayLlmPrepared = {
  readonly task: PreparedTask;
  readonly route: GatewayLlmRoute;
  readonly reasoningEffort: string;
  readonly structured: boolean;
  /** Where the last decoded output broke the schema, as safe path:keyword entries. */
  readonly outputViolations: () => GatewayLlmOutputViolations | undefined;
};

/** Validate the requested route and prepare provider SDK output decoding before dispatch.
 * Neither task identity nor an account is selected until this succeeds.
 */
export const prepareGatewayLlmTask = (
  command: AgentRuntimeTaskCommand,
  startedAt: number,
  options: Pick<GatewayLlmClientOptions, "route" | "policy">,
): GatewayLlmPrepared | { readonly failure: AgentRuntimeFailure } => {
  const route = options.route;
  const admission = admitGatewayLlmTaskRoute(command, route);
  if (admission !== null) return admission;
  const preparedOutput = prepareGatewayLlmOutput(command.outputSchema);
  if ("failure" in preparedOutput) return preparedOutput;
  return {
    route,
    structured: preparedOutput.structured,
    outputViolations: preparedOutput.outputViolations,
    reasoningEffort: route.reasoningEffort ?? gatewayDefaultReasoningEffort,
    task: gatewayLlmSdkTaskPayload(command, startedAt, route, options.policy, preparedOutput),
  };
};
