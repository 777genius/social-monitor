import type {
  LlmClient, LlmEffort, LlmFailure, LlmPolicy, LlmTask,
} from "@agent-teams/account-gateway/llm";
import type { Clock } from "@social-monitor/shared-kernel";
import { gatewayLlmRuntimeEngine } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";

import type {
  AgentRuntimeClientPort, AgentRuntimeFailure, AgentRuntimeHealthResult,
  AgentRuntimeTaskCommand, AgentRuntimeTaskResult,
} from "../../../ports";
import type { GatewayLlmAccountSelector } from "./gateway-llm-account-selector";
import type { GatewayLlmAttemptIdentity, GatewayLlmAttemptSource } from "./gateway-llm-attempts";
import { gatewayLlmFailure } from "./gateway-llm-failure";
import type { GatewayLlmSdkIdentity } from "./gateway-llm-sdk-identity";
import { prepareGatewayLlmTask, type GatewayLlmPrepared } from "./gateway-llm-task-preparation";
import { completeGatewayLlmTask } from "./gateway-llm-task-completion";

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
  private readonly maxRetries: number;

  constructor(private readonly options: GatewayLlmClientOptions) {
    this.maxRetries = options.maxDispatchFreeRetries ?? 2;
  }

  async runTask(
    command: AgentRuntimeTaskCommand,
    options?: { readonly signal?: AbortSignal },
  ): Promise<AgentRuntimeTaskResult> {
    const startedAt = this.options.clock.now().getTime();
    const prepared = prepareGatewayLlmTask(command, startedAt, this.options);
    if ("failure" in prepared) return failed(prepared.failure, 0);
    let identity = this.options.attempts.next(command.requestId);
    let task = this.withAttempt(prepared, identity);
    for (let retries = 0; ; retries += 1) {
      const result = await this.options.llm.generate(task, options);
      const now = this.options.clock.now();
      if (result.ok) {
        this.observe(result.receipt.accountRef, "completed", 0, now);
        return completeGatewayLlmTask(command, prepared, identity, result, now.getTime() - startedAt, this.options.sdk);
      }
      const retry = result.retry;
      const afterMs = retry.kind === "never" ? 0 : retry.afterMs;
      this.observe(result.execution?.accountRef ?? null, observation(result), afterMs, now);
      const remainingMs = prepared.task.deadline.getTime() - now.getTime();
      const replay = retry.kind === "same_attempt" ||
        (retry.kind === "new_attempt" && !retry.mayDuplicateCost);
      if (!replay || retries >= this.maxRetries || options?.signal?.aborted === true ||
          remainingMs <= afterMs) {
        const elapsedMs = now.getTime() - startedAt;
        const failure = gatewayLlmFailure(result, identity, prepared.outputViolations());
        return failed({ ...failure, details: { ...failure.details,
          gatewayElapsedMs: String(elapsedMs),
          gatewaySoftTimeoutMs: String(command.timeoutMs),
          gatewayHardTimeoutMs: String(prepared.task.deadline.getTime() - startedAt),
        } }, elapsedMs);
      }
      await this.options.sleep(afterMs, options?.signal);
      if (retry.kind === "new_attempt") {
        identity = this.options.attempts.next(command.requestId);
        task = this.withAttempt(prepared, identity);
      }
    }
  }

  async checkHealth(): Promise<AgentRuntimeHealthResult> {
    let serving = true;
    try {
      serving = this.options.probe === undefined || await this.options.probe();
    } catch {
      serving = false;
    }
    return {
      status: serving ? "serving" : "not_serving",
      runtimeEngine: gatewayLlmRuntimeEngine,
      runtimeVersion: this.options.sdk.packageVersion,
      launcherSha256: this.options.sdk.archiveSha256,
      warnings: [],
    };
  }

  private withAttempt(prepared: GatewayLlmPrepared, identity: GatewayLlmAttemptIdentity):
  LlmTask<Record<string, unknown>> {
    return {
      ...prepared.task,
      taskId: identity.taskId,
      attempt: identity.attempt,
      accountRefs: this.options.accounts.order({ taskId: identity.taskId,
        accountRefs: prepared.route.accountRefs, now: this.options.clock.now() }),
    };
  }

  private observe(accountRef: string | null,
    outcome: "completed" | "busy" | "unauthorized" | "other", retryAfterMs: number, now: Date): void {
    this.options.accounts.observe({ accountRef, outcome, retryAfterMs, now });
  }
}

const observation = (failure: LlmFailure): "busy" | "unauthorized" | "other" =>
  failure.code === "busy" ? "busy" : failure.code === "unauthorized" ? "unauthorized" : "other";

const failed = (failure: AgentRuntimeFailure, durationMs: number): AgentRuntimeTaskResult => ({
  status: "failed", warnings: [], failure, durationMs,
});
