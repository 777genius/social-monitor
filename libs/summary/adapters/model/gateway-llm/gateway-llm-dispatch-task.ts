import type { LlmTask } from "@agent-teams/account-gateway/llm";
import type { GatewayLlmClientOptions } from "./gateway-llm-client-contract";
import type { GatewayLlmAttemptIdentity } from "./gateway-llm-attempts";
import type { GatewayLlmPrepared } from "./gateway-llm-task-preparation";

/**
 * Bind one already-admitted logical gateway task to an execution attempt.
 * The account selector is consulted on initial dispatch and on every newly
 * allocated attempt; same-attempt safe replay preserves the existing binding.
 * This adapter policy has no transport, retry, or settlement decisions.
 */
export const bindGatewayLlmDispatchTask = (
  prepared: GatewayLlmPrepared,
  identity: GatewayLlmAttemptIdentity,
  options: Pick<GatewayLlmClientOptions, "accounts" | "clock">,
): LlmTask<Record<string, unknown>> => ({
  ...prepared.task,
  taskId: identity.taskId,
  attempt: identity.attempt,
  accountRefs: options.accounts.order({ taskId: identity.taskId,
    accountRefs: prepared.route.accountRefs, now: options.clock.now() }),
});
