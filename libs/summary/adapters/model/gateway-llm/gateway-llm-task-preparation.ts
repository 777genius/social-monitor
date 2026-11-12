import type { LlmTask } from "@agent-teams/account-gateway/llm";

import type { AgentRuntimeFailure, AgentRuntimeTaskCommand } from "../../../ports";
import { codexReaderSummaryBackend, gatewayDefaultReasoningEffort } from "../active-reader-summary-generation-profile";
import type { GatewayLlmClientOptions, GatewayLlmRoute } from "./gateway-llm-client";
import { gatewayLlmLocalFailure, type GatewayLlmOutputViolations } from "./gateway-llm-failure";
import { prepareGatewayLlmOutput } from "./gateway-llm-structured-output";
import { gatewayLlmDeadline } from "./gateway-llm-deadline";
import { gatewayLlmOutputBytes } from "./gateway-llm-output-budget";

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
  const preparedOutput = prepareGatewayLlmOutput(command.outputSchema);
  if ("failure" in preparedOutput) return preparedOutput;
  const requested = controls.maxOutputTokens;
  return {
    route,
    structured: preparedOutput.structured,
    outputViolations: preparedOutput.outputViolations,
    reasoningEffort: route.reasoningEffort ?? gatewayDefaultReasoningEffort,
    task: {
      profileId: route.profileId,
      model: route.model,
      policy: options.policy,
      instructions: command.systemPrompt,
      input: command.prompt,
      output: preparedOutput.output,
      ...(route.reasoningEffort === undefined ? {} : { effort: route.reasoningEffort }),
      maxOutputTokens: Math.max(route.minOutputTokens,
        Number.isSafeInteger(requested) && (requested as number) > 0 ? requested as number : 0),
      limits: { outputBytes: gatewayLlmOutputBytes(command.purpose) },
      deadline: gatewayLlmDeadline(startedAt, command.timeoutMs),
      ...(preparedOutput.decode === undefined ? {} : { decode: preparedOutput.decode }),
    },
  };
};
