import { DomainError, err, ok } from '@social-monitor/shared-kernel';

import {
  BIND_SOURCE_CREATION_SCOPE,
  type SourceBindingCreationCommitPort,
} from '../../application/contracts/source-binding-creation-commit';
import {
  decideSourceBindingCreation,
  replaySourceBindingReceipt,
  validateSourceBindingCreationCommit,
} from '../../application/source-binding-creation-decision';
import { InMemoryInterestCreationState, monitoringInterestKey, monitoringReceiptKey } from './in-memory-interest-creation-state';

export class InMemorySourceBindingCreationStore implements SourceBindingCreationCommitPort {
  constructor(private readonly state: InMemoryInterestCreationState) {}

  async commit(params: Parameters<SourceBindingCreationCommitPort['commit']>[0]) {
    const invalid = validateSourceBindingCreationCommit(params);
    if (invalid) return err(invalid);
    const snapshot = params.binding.toSnapshot();
    const scope = { tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId };
    const receiptKey = monitoringReceiptKey({ ...scope, scope: BIND_SOURCE_CREATION_SCOPE, key: params.idempotencyKey });
    const cached = this.state.receipts.get(receiptKey);
    if (cached !== null && cached !== undefined) return replaySourceBindingReceipt(cached);

    const interest = this.state.interests.get(monitoringInterestKey(
      snapshot.tenantId, snapshot.workspaceId, snapshot.interestId));
    if (interest === undefined) {
      return err(new DomainError('resource.not_found', 'Interest not found', { interestId: snapshot.interestId }));
    }
    const existingReceiptId = [...this.state.receiptIds].find(([, key]) => key === receiptKey)?.[0];
    const receiptId = existingReceiptId ?? params.receiptId;
    if (existingReceiptId === undefined && this.state.receiptIds.has(receiptId)) {
      return err(new Error('Source binding creation receipt identity already exists'));
    }
    const sourceBindings = [...this.state.sourceBindingsById.values()].map((binding) => binding.toSnapshot())
      .filter((binding) => binding.tenantId === snapshot.tenantId &&
        binding.workspaceId === snapshot.workspaceId && binding.interestId === snapshot.interestId);
    const existing = sourceBindings.find((binding) => binding.providerKey === snapshot.providerKey &&
      (params.configIdentity === undefined ||
        binding.config[params.configIdentity.field] === params.configIdentity.value));
    const decision = decideSourceBindingCreation({
      candidateId: snapshot.id,
      existingId: existing?.id,
      enabledCount: sourceBindings.filter((binding) => binding.status === 'enabled').length,
      maximum: params.maxEnabledSourcesPerInterest,
    });
    if (!decision.ok) return decision;
    if (decision.value.created && (
      [...this.state.sourceBindingsById.values()].some((binding) => binding.toSnapshot().id === snapshot.id) ||
      this.state.events.some((event) => event.eventId === params.event.eventId)
    )) return err(new Error('Source binding aggregate or event identity already exists'));

    // No await before the single backing-state swap: binding/event/receipt
    // become visible together to all existing local repository readers.
    try {
      this.state.publish({
        receiptKey, receiptId, receipt: decision.value,
        ...(decision.value.created ? { sourceBinding: params.binding, event: params.event } : {}),
      });
      return ok(decision.value);
    } catch (error) {
      return err(error instanceof Error ? error : new Error('Source binding creation commit failed'));
    }
  }
}
