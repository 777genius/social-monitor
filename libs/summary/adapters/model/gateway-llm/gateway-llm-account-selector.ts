import { createHash } from "node:crypto";
import {
  GatewayLlmAccountCooldowns,
  type CooldownAccountSelectorPolicy,
  type GatewayLlmAccountObservation,
} from "./gateway-llm-account-cooldowns";

export type { CooldownAccountSelectorPolicy, GatewayLlmAccountObservation } from "./gateway-llm-account-cooldowns";

/** The gateway accepts at most this many account preferences per task. */
export const gatewayLlmMaxAccountRefs = 16;

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
    const refs = [...new Set(input.accountRefs)];
    if (refs.length === 0 || refs.length > gatewayLlmMaxAccountRefs) {
      throw new Error("Gateway llm route requires 1..16 distinct accounts");
    }
    const offset = stableOffset(input.taskId, refs.length);
    const rotated = [...refs.slice(offset), ...refs.slice(0, offset)];
    return this.cooldowns.prioritize(rotated, input.now);
  }

  observe(observation: GatewayLlmAccountObservation): void {
    this.cooldowns.observe(observation);
  }
}

const stableOffset = (taskId: string, size: number): number =>
  createHash("sha256").update(taskId, "utf8").digest().readUInt32BE(0) % size;
