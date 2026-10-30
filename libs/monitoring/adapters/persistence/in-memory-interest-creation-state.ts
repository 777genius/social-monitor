import type { EventEnvelope } from '@social-monitor/shared-kernel';

import type { Interest } from '../../domain';

type CreationState = {
  readonly interests: Map<string, Interest>;
  readonly archivedNames: Map<string, string>;
  readonly receipts: Map<string, unknown>;
  readonly receiptIds: Map<string, string>;
  readonly events: EventEnvelope<Readonly<Record<string, unknown>>>[];
};

/** One process-local backing state shared by the existing monitoring adapters. */
export class InMemoryInterestCreationState {
  private current: CreationState = {
    interests: new Map(), archivedNames: new Map(), receipts: new Map(), receiptIds: new Map(), events: [],
  };

  get interests() { return this.current.interests; }
  get archivedNames() { return this.current.archivedNames; }
  get receipts() { return this.current.receipts; }
  get receiptIds() { return this.current.receiptIds; }
  get events() { return this.current.events; }

  publish(params: {
    readonly interest?: Interest;
    readonly event?: EventEnvelope<Readonly<Record<string, unknown>>>;
    readonly receiptKey: string;
    readonly receiptId: string;
    readonly receipt: unknown;
  }): void {
    // Allocate/prepare every effect first. A single synchronous assignment makes
    // the creation visible together, including to existing repository readers.
    const interests = new Map(this.current.interests);
    if (params.interest) {
      const snapshot = params.interest.toSnapshot();
      interests.set(monitoringInterestKey(snapshot.tenantId, snapshot.workspaceId, snapshot.id), params.interest);
    }
    const receipts = new Map(this.current.receipts).set(params.receiptKey, params.receipt);
    const receiptIds = new Map(this.current.receiptIds).set(params.receiptId, params.receiptKey);
    const events = params.event ? [...this.current.events, params.event] : this.current.events;
    this.current = { ...this.current, interests, receipts, receiptIds, events };
  }
}

export const monitoringInterestKey = (tenant: string, workspace: string, interest: string): string =>
  `${tenant}:${workspace}:${interest}`;

export const monitoringInterestNameKey = (tenant: string, workspace: string, name: string): string =>
  `${tenant}:${workspace}:${name}`;

export const monitoringReceiptKey = (params: {
  readonly tenantId: string; readonly workspaceId: string; readonly scope: string; readonly key: string;
}): string => `${params.tenantId}:${params.workspaceId}:${params.scope}:${params.key}`;
