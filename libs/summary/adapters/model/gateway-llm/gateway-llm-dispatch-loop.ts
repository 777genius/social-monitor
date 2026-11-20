import type { LlmFailure } from "@agent-teams/account-gateway/llm";
import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "../../../ports";
import type { GatewayLlmClientOptions } from "./gateway-llm-client-contract";
import type { GatewayLlmPrepared } from "./gateway-llm-task-preparation";
import { completeGatewayLlmTask } from "./gateway-llm-task-completion";
import { completeGatewayLlmFailedTask } from "./gateway-llm-task-failure";
import { gatewayLlmDispatchFreeRetry } from "./gateway-llm-dispatch-retry-policy";
import { gatewayLlmPostBackoffStop } from "./gateway-llm-post-backoff-admission";
import { bindGatewayLlmDispatchTask } from "./gateway-llm-dispatch-task";

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
    let task = bindGatewayLlmDispatchTask(prepared, identity, this.options);
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
      // A cancellation or deadline can become effective during the backoff.
      // Do not allocate a new attempt or submit a second provider request.
      const resumedAt = this.options.clock.now();
      const stop = gatewayLlmPostBackoffStop({
        resumedAt, startedAt, deadline: prepared.task.deadline,
        signal: options?.signal, usage: result.usage,
      });
      if (stop !== null) return stop;
      if (retryDecision.replay === "new_attempt") {
        identity = this.options.attempts.next(command.requestId);
        task = bindGatewayLlmDispatchTask(prepared, identity, this.options);
      }
    }
  }

  private observe(accountRef: string | null,
    outcome: "completed" | "busy" | "unauthorized" | "other", retryAfterMs: number, now: Date): void {
    this.options.accounts.observe({ accountRef, outcome, retryAfterMs, now });
  }
}

const observation = (failure: LlmFailure): "busy" | "unauthorized" | "other" =>
  failure.code === "busy" ? "busy" : failure.code === "unauthorized" ? "unauthorized" : "other";
