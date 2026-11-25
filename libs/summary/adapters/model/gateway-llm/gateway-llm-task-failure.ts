import type { LlmFailure } from "@agent-teams/account-gateway/llm";
import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "../../../ports";
import type { GatewayLlmAttemptIdentity } from "./gateway-llm-attempts";
import { gatewayLlmFailure } from "./gateway-llm-failure";
import type { GatewayLlmPrepared } from "./gateway-llm-task-preparation";
import { gatewayLlmUsage } from "./gateway-llm-usage";

/** Complete a terminal SDK failure without output or execution attestation.
 * Dispatch/retry admission and account observation remain in the dispatch owner;
 * this projection owns safe diagnostics and settled usage. */
export const completeGatewayLlmFailedTask = (params: {
  readonly command: AgentRuntimeTaskCommand;
  readonly prepared: GatewayLlmPrepared;
  readonly identity: GatewayLlmAttemptIdentity;
  readonly result: LlmFailure;
  readonly now: Date;
  readonly startedAt: number;
}): AgentRuntimeTaskResult => {
  const { command, prepared, identity, result, now, startedAt } = params;
  const elapsedMs = now.getTime() - startedAt;
  const failure = gatewayLlmFailure(result, identity, prepared.outputViolations());
  return {
    status: "failed",
    warnings: [],
    failure: {
      ...failure,
      details: {
        ...failure.details,
        gatewayElapsedMs: String(elapsedMs),
        gatewaySoftTimeoutMs: String(command.timeoutMs),
        gatewayHardTimeoutMs: String(prepared.task.deadline.getTime() - startedAt),
      },
    },
    durationMs: elapsedMs,
    ...gatewayLlmUsage(result.usage),
  };
};
