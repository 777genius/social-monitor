/**
 * Process-local gateway admission observations. This policy does not choose
 * accounts or exclude cooling accounts: the gateway remains the authority
 * on availability and receives every configured account reference.
 */
export type GatewayLlmAccountObservation = {
  readonly accountRef: string | null;
  readonly outcome: "completed" | "busy" | "unauthorized" | "other";
  readonly retryAfterMs: number;
  readonly now: Date;
};

export type CooldownAccountSelectorPolicy = {
  /** Minimum pause after the provider or gateway reported an exhausted account. */
  readonly busyCooldownMs: number;
  /** Pause after an authorization failure; the account needs operator repair. */
  readonly unauthorizedCooldownMs: number;
};

export class GatewayLlmAccountCooldowns {
  private readonly coolUntil = new Map<string, number>();

  constructor(private readonly policy: CooldownAccountSelectorPolicy) {
    if (
      !(policy.busyCooldownMs >= 0) || !Number.isFinite(policy.busyCooldownMs) ||
      !(policy.unauthorizedCooldownMs >= 0) || !Number.isFinite(policy.unauthorizedCooldownMs)
    ) {
      throw new Error("Gateway account cooldowns must be non-negative");
    }
  }

  /** Retain stable rotated order for ready accounts and expiry order for cooling ones. */
  prioritize(rotated: readonly string[], at: Date): readonly string[] {
    const now = at.getTime();
    if (!Number.isFinite(now)) {
      throw new Error("Gateway account observation time must be valid");
    }
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
    if (!Number.isFinite(now)) {
      throw new Error("Gateway account observation time must be valid");
    }
    if (observation.outcome === "completed") {
      this.coolUntil.delete(ref);
    } else if (observation.outcome === "busy") {
      const retryAfterMs = Number.isFinite(observation.retryAfterMs)
        ? observation.retryAfterMs
        : this.policy.busyCooldownMs;
      this.coolUntil.set(ref, now + Math.max(retryAfterMs,
        this.policy.busyCooldownMs));
    } else if (observation.outcome === "unauthorized") {
      this.coolUntil.set(ref, now + this.policy.unauthorizedCooldownMs);
    }
  }
}
