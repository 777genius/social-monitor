import { rotateGatewayLlmAccountRefs } from "./gateway-llm-account-order-policy";
import {
  GatewayLlmAccountCooldowns,
  type CooldownAccountSelectorPolicy,
  type GatewayLlmAccountObservation,
} from "./gateway-llm-account-cooldowns";

export type { CooldownAccountSelectorPolicy, GatewayLlmAccountObservation } from "./gateway-llm-account-cooldowns";

export { gatewayLlmMaxAccountRefs } from "./gateway-llm-account-order-policy";

/**
 * Orders the configured accounts for one task. The gateway executes on the
 * first active account in this order and does not balance load itself.
 */
export interface GatewayLlmAccountSelector {
  order(input: {
    readonly taskId: string;
    readonly accountRefs: readonly string[];
    readonly now: Date;
  }): readonly string[];
  observe(observation: GatewayLlmAccountObservation): void;
}

/**
 * Spreads tasks over accounts by a stable task hash and moves accounts that
 * recently reported exhausted quota or broken authorization to the end.
 * Cooled accounts stay in the list: the gateway remains the authority on
 * whether an account is usable, and an empty list would only fail earlier.
 * State is process-local; each run starts optimistic and relearns from the
 * gateway's own admission answers.
 */
export class CooldownRotatingAccountSelector implements GatewayLlmAccountSelector {
  private readonly cooldowns: GatewayLlmAccountCooldowns;

  constructor(policy: CooldownAccountSelectorPolicy) {
    this.cooldowns = new GatewayLlmAccountCooldowns(policy);
  }

  order(input: {
    readonly taskId: string;
    readonly accountRefs: readonly string[];
    readonly now: Date;
  }): readonly string[] {
    return this.cooldowns.prioritize(rotateGatewayLlmAccountRefs(input), input.now);
  }

  observe(observation: GatewayLlmAccountObservation): void {
    this.cooldowns.observe(observation);
  }
}

