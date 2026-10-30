import { err, ok } from '@social-monitor/shared-kernel';

import { INTEREST_CREATION_SCOPE, type InterestCreationCommitPort } from '../../application/contracts/interest-creation-commit';
import { decideInterestCreation, replayInterestCreation, validateInterestCreationCommit } from '../../application/interest-creation-decision';
import { type InMemoryInterestCreationState, monitoringInterestNameKey, monitoringReceiptKey } from './in-memory-interest-creation-state';

export class InMemoryInterestCreationStore implements InterestCreationCommitPort {
  constructor(private readonly state: InMemoryInterestCreationState) {}

  async commit(params: Parameters<InterestCreationCommitPort['commit']>[0]) {
    const invalid = validateInterestCreationCommit(params);
    if (invalid) return err(invalid);
    const snapshot = params.interest.toSnapshot();
    const receiptKey = monitoringReceiptKey({ ...snapshot, scope: INTEREST_CREATION_SCOPE, key: params.idempotencyKey });
    const cached = this.state.receipts.get(receiptKey);
    if (cached !== null && cached !== undefined) return replayInterestCreation(cached);
    const existingReceiptId = [...this.state.receiptIds].find(([, key]) => key === receiptKey)?.[0];
    const receiptId = existingReceiptId ?? params.receiptId;
    if (existingReceiptId === undefined && this.state.receiptIds.has(receiptId)) {
      return err(new Error('Interest creation receipt identity already exists'));
    }
    const active = [...this.state.interests.values()].map((interest) => interest.toSnapshot())
      .filter((interest) => interest.tenantId === snapshot.tenantId && interest.workspaceId === snapshot.workspaceId);
    const existing = active.find((interest) => interest.name === snapshot.name);
    const archivedId = this.state.archivedNames.get(monitoringInterestNameKey(snapshot.tenantId, snapshot.workspaceId, snapshot.name));
    const decision = decideInterestCreation({
      candidateId: snapshot.id, existing: existing ? { id: existing.id, archived: false }
        : archivedId ? { id: archivedId, archived: true } : undefined,
      activeCount: active.length, maximum: params.maxInterestsPerWorkspace,
    });
    if (!decision.ok) return decision;
    if (decision.value.created && ([...this.state.interests.values()].some((interest) => interest.toSnapshot().id === snapshot.id) ||
        [...this.state.archivedNames.values()].includes(snapshot.id) ||
        this.state.events.some((event) => event.eventId === params.event.eventId))) {
      return err(new Error('Interest creation aggregate or event identity already exists'));
    }
    try {
      this.state.publish({ receiptKey, receiptId, receipt: decision.value,
        ...(decision.value.created ? { interest: params.interest, event: params.event } : {}),
      });
      return ok(decision.value);
    } catch (error) {
      return err(error instanceof Error ? error : new Error('Interest creation commit failed'));
    }
  }
}
