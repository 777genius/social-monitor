import type {
  LlmClient, LlmEffort, LlmPolicy,
} from "@agent-teams/account-gateway/llm";
import type { Clock } from "@social-monitor/shared-kernel";

import type {
  AgentRuntimeClientPort, AgentRuntimeFailure, AgentRuntimeHealthResult,
  AgentRuntimeTaskCommand, AgentRuntimeTaskResult,
} from "../../../ports";
import type { GatewayLlmAccountSelector } from "./gateway-llm-account-selector";
import type { GatewayLlmAttemptSource } from "./gateway-llm-attempts";
import type { GatewayLlmSdkIdentity } from "./gateway-llm-sdk-identity";
import { prepareGatewayLlmTask } from "./gateway-llm-task-preparation";
import { GatewayLlmDispatch } from "./gateway-llm-dispatch-loop";
import { readGatewayLlmHealth } from "./gateway-llm-health";

/**
 * The one gateway profile and model a client serves. Tasks must name exactly
 * this backend and model; anything else is refused before any gateway call.
 */
export type GatewayLlmRoute = {
  readonly profileId: string;
  /** Reader-summary backend a task names in controls.modelBackend. */
  readonly modelBackend: string;
  readonly model: string;
  /** Effort sent with every task; undefined sends no reasoning control. */
  readonly reasoningEffort?: LlmEffort;
  readonly accountRefs: readonly string[];
  /**
   * Floor of max_output_tokens. Reasoning models spend output tokens before
   * the answer, so the product budgets alone end as output_truncated.
   */
  readonly minOutputTokens: number;
};

export type GatewayLlmClientOptions = {
  readonly llm: Pick<LlmClient, "generate">;
  readonly policy: LlmPolicy;
  readonly route: GatewayLlmRoute;
  readonly attempts: GatewayLlmAttemptSource;
  readonly accounts: GatewayLlmAccountSelector;
  readonly sdk: GatewayLlmSdkIdentity;
  readonly clock: Clock;
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Retries that cannot duplicate cost: replay before dispatch, or busy. */
  readonly maxDispatchFreeRetries?: number;
  readonly probe?: () => Promise<boolean>;
};

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
