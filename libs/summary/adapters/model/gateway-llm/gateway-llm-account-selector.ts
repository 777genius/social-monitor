import { createHash } from "node:crypto";

/** The gateway accepts at most this many account preferences per task. */
export const gatewayLlmMaxAccountRefs = 16;

export type GatewayLlmAccountObservation = {
  readonly accountRef: string | null;
  readonly outcome: "completed" | "busy" | "unauthorized" | "other";
  readonly retryAfterMs: number;
  readonly now: Date;
};

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

export type CooldownAccountSelectorPolicy = {
  /** Minimum pause after the provider or gateway reported an exhausted account. */
  readonly busyCooldownMs: number;
  /** Pause after an authorization failure; the account needs operator repair. */
  readonly unauthorizedCooldownMs: number;
};

/**
 * Spreads tasks over accounts by a stable task hash and moves accounts that
 * recently reported exhausted quota or broken authorization to the end.
 * Cooled accounts stay in the list: the gateway remains the authority on
 * whether an account is usable, and an empty list would only fail earlier.
 * State is process-local; each run starts optimistic and relearns from the
 * gateway's own admission answers.
 */
export class CooldownRotatingAccountSelector implements GatewayLlmAccountSelector {
  private readonly coolUntil = new Map<string, number>();

  constructor(private readonly policy: CooldownAccountSelectorPolicy) {
    if (!(policy.busyCooldownMs >= 0) || !(policy.unauthorizedCooldownMs >= 0)) {
      throw new Error("Gateway account cooldowns must be non-negative");
    }
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
    const now = input.now.getTime();
    const ready = rotated.filter((ref) => (this.coolUntil.get(ref) ?? 0) <= now);
    const cooling = rotated
      .filter((ref) => (this.coolUntil.get(ref) ?? 0) > now)
      .sort((left, right) => this.coolUntil.get(left)! - this.coolUntil.get(right)!);
    return [...ready, ...cooling];
  }

  observe(observation: GatewayLlmAccountObservation): void {
    const ref = observation.accountRef;
    if (ref === null) return;
    const now = observation.now.getTime();
    if (observation.outcome === "completed") {
      this.coolUntil.delete(ref);
    } else if (observation.outcome === "busy") {
      this.coolUntil.set(ref, now + Math.max(observation.retryAfterMs,
        this.policy.busyCooldownMs));
    } else if (observation.outcome === "unauthorized") {
      this.coolUntil.set(ref, now + this.policy.unauthorizedCooldownMs);
    }
  }
}

const stableOffset = (taskId: string, size: number): number =>
  createHash("sha256").update(taskId, "utf8").digest().readUInt32BE(0) % size;
