import type { Clock } from '@social-monitor/shared-kernel';

export interface OutboxLeaseStore {
  renewClaims(params: {
    readonly ids: readonly string[];
    readonly leaseOwner: string;
    readonly now: Date;
    readonly leasedUntil: Date;
  }): Promise<boolean>;
}

/**
 * Keeps both the currently publishing row and later claimed rows owned.
 * A failed or late renewal stops subsequent sends; broker effects already
 * in flight remain at-least-once, never a claim of exactly-once delivery.
 */
export class OutboxLeaseHeartbeat {
  private readonly pending: Set<string>;
  private readonly timer: NodeJS.Timeout;
  private renewal: Promise<void> | undefined;
  private ownershipLost = false;
  private validUntil: Date;

  constructor(
    private readonly store: OutboxLeaseStore,
    ids: readonly string[],
    private readonly owner: string,
    private readonly clock: Clock,
    private readonly leaseMs: number,
    initialExpiry: Date,
  ) {
    this.pending = new Set(ids);
    if (this.pending.size !== ids.length || ids.some((id) => id.trim().length === 0)) {
      throw new Error('Outbox claim contains duplicate or blank identities');
    }
    this.validUntil = initialExpiry;
    this.timer = setInterval(() => {
      if (this.pending.size === 0 || this.renewal !== undefined || this.ownershipLost) return;
      const renewal = this.renew();
      this.renewal = renewal;
      void renewal.finally(() => {
        if (this.renewal === renewal) this.renewal = undefined;
      }).catch(() => undefined);
    }, Math.max(1, Math.floor(leaseMs / 3)));
    this.timer.unref();
  }

  async assertOwned(): Promise<void> {
    await this.renewal;
    if (this.ownershipLost || this.clock.now().getTime() >= this.validUntil.getTime()) {
      this.ownershipLost = true;
      throw new Error('Outbox lease ownership was lost');
    }
  }

  /** Called immediately before the fenced durable settlement. */
  completed(id: string): void {
    this.pending.delete(id);
  }

  /**
   * After isolating one uncertain row, establish authority for the remaining
   * subset from the database. An older in-flight renewal may have included the
   * removed row; only this fresh positive result can clear its uncertainty.
   */
  async verifyRemainingClaims(): Promise<void> {
    await this.renewal;
    if (this.pending.size === 0) return;
    const renewal = this.renew(true);
    this.renewal = renewal;
    try {
      await renewal;
      await this.assertOwned();
    } finally {
      if (this.renewal === renewal) this.renewal = undefined;
    }
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    await this.renewal;
  }

  private async renew(recheckRemaining = false): Promise<void> {
    const ids = [...this.pending];
    if (ids.length === 0) return;
    const now = this.clock.now();
    if (!recheckRemaining && now.getTime() >= this.validUntil.getTime()) {
      this.ownershipLost = true;
      return;
    }
    const leasedUntil = new Date(now.getTime() + this.leaseMs);
    try {
      const renewed = await this.store.renewClaims({
        ids, leaseOwner: this.owner, now, leasedUntil,
      });
      if (!renewed) {
        this.ownershipLost = true;
        return;
      }
      this.validUntil = leasedUntil;
      if (recheckRemaining) this.ownershipLost = false;
    } catch {
      // A database error makes lease ownership uncertain, never success.
      this.ownershipLost = true;
    }
  }
}
