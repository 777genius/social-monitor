import type { LlmClient, LlmEffort, LlmPolicy } from "@agent-teams/account-gateway/llm";
import type { Clock } from "@social-monitor/shared-kernel";
import type { GatewayLlmAccountSelector } from "./gateway-llm-account-selector";
import type { GatewayLlmAttemptSource } from "./gateway-llm-attempts";
import type { GatewayLlmSdkIdentity } from "./gateway-llm-sdk-identity";

/** Configuration/route contract is independent of the concrete transport facade. */
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

