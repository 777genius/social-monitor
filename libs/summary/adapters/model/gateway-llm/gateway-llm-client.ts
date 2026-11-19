
import type {
  AgentRuntimeClientPort, AgentRuntimeFailure, AgentRuntimeHealthResult,
  AgentRuntimeTaskCommand, AgentRuntimeTaskResult,
} from "../../../ports";
import { prepareGatewayLlmTask } from "./gateway-llm-task-preparation";
import { GatewayLlmDispatch } from "./gateway-llm-dispatch-loop";
import { readGatewayLlmHealth } from "./gateway-llm-health";
import type { GatewayLlmClientOptions } from "./gateway-llm-client-contract";

// Preserve both historical public type exports for external composition roots.
export type { GatewayLlmClientOptions, GatewayLlmRoute } from "./gateway-llm-client-contract";

/**
 * Agent-runtime port over the account-gateway `llm` SDK: one bounded model
 * call per task. Workspace, cwd and provider-instance fields of the port are
 * CLI concerns and are ignored here. The SDK never retries; this adapter only
 * repeats attempts that cannot have been paid, and leaves every possibly
 * duplicated cost to the caller.
 */
export class GatewayLlmClient implements AgentRuntimeClientPort {
  private readonly dispatch: GatewayLlmDispatch;

  constructor(private readonly options: GatewayLlmClientOptions) {
    this.dispatch = new GatewayLlmDispatch(options);
  }

  async runTask(
    command: AgentRuntimeTaskCommand,
    options?: { readonly signal?: AbortSignal },
  ): Promise<AgentRuntimeTaskResult> {
    const startedAt = this.options.clock.now().getTime();
    const prepared = prepareGatewayLlmTask(command, startedAt, this.options);
    if ("failure" in prepared) return failed(prepared.failure, 0);
    return this.dispatch.runTask(command, prepared, startedAt, options);
  }

  async checkHealth(): Promise<AgentRuntimeHealthResult> {
    return readGatewayLlmHealth(this.options.sdk, this.options.probe);
  }
}

const failed = (failure: AgentRuntimeFailure, durationMs: number): AgentRuntimeTaskResult => ({
  status: "failed", warnings: [], failure, durationMs,
});
