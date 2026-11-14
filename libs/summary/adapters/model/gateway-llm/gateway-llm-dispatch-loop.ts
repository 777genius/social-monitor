import type { LlmFailure, LlmTask } from "@agent-teams/account-gateway/llm";
import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "../../../ports";
import type { GatewayLlmClientOptions } from "./gateway-llm-client";
import type { GatewayLlmAttemptIdentity } from "./gateway-llm-attempts";
import type { GatewayLlmPrepared } from "./gateway-llm-task-preparation";
import { completeGatewayLlmTask } from "./gateway-llm-task-completion";
import { completeGatewayLlmFailedTask } from "./gateway-llm-task-failure";
import { gatewayLlmDispatchFreeRetry } from "./gateway-llm-dispatch-retry-policy";

/** SDK dispatch owns account feedback, attempt identity, safe replay, and settlement.
 * Route/response validation and transport-independent failure projection stay separate. */
export class GatewayLlmDispatch {
  private readonly maxRetries: number;

  constructor(private readonly options: GatewayLlmClientOptions) {
    this.maxRetries = options.maxDispatchFreeRetries ?? 2;
  }

  async runTask(
    command: AgentRuntimeTaskCommand,
    prepared: GatewayLlmPrepared,
    startedAt: number,
    options?: { readonly signal?: AbortSignal },
  ): Promise<AgentRuntimeTaskResult> {
    let identity = this.options.attempts.next(command.requestId);
    let task = this.withAttempt(prepared, identity);
    for (let retries = 0; ; retries += 1) {
      const result = await this.options.llm.generate(task, options);
      const now = this.options.clock.now();
      if (result.ok) {
        this.observe(result.receipt.accountRef, "completed", 0, now);
        return completeGatewayLlmTask(command, prepared, identity, result, now.getTime() - startedAt, this.options.sdk);
      }
      const retryDecision = gatewayLlmDispatchFreeRetry({
        retry: result.retry,
        retries,
        maxRetries: this.maxRetries,
        deadlineMs: prepared.task.deadline.getTime(),
        nowMs: now.getTime(),
        signal: options?.signal,
      });
      this.observe(result.execution?.accountRef ?? null, observation(result), retryDecision.afterMs, now);
      if (retryDecision.replay === null) {
        return completeGatewayLlmFailedTask({
          command, prepared, identity, result, now, startedAt,
        });
      }
      await this.options.sleep(retryDecision.afterMs, options?.signal);
      if (retryDecision.replay === "new_attempt") {
        identity = this.options.attempts.next(command.requestId);
        task = this.withAttempt(prepared, identity);
      }
    }
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
