import { DomainError, err, ok } from '@social-monitor/shared-kernel';

import {
  SOURCE_BINDING_STATUS_CHANGE_SCOPE,
  type SourceBindingStatusChangeCommitPort,
} from '../../application/contracts/source-binding-status-change-commit';
import {
  decideSourceBindingStatusChange,
  replaySourceBindingStatusReceipt,
  sourceBindingStatusChangedEvent,
  validateSourceBindingStatusChange,
} from '../../application/source-binding-status-change-decision';
import {
  type InMemoryInterestCreationState, monitoringReceiptKey, monitoringSourceBindingIdKey,
} from './in-memory-interest-creation-state';

export class InMemorySourceBindingStatusChangeStore implements SourceBindingStatusChangeCommitPort {
  constructor(private readonly state: InMemoryInterestCreationState) {}

  async change(params: Parameters<SourceBindingStatusChangeCommitPort['change']>[0]) {
    const invalid = validateSourceBindingStatusChange(params);
    if (invalid) return err(invalid);
    const command = params.command;
    const key = monitoringReceiptKey({
      tenantId: command.tenantId, workspaceId: command.workspaceId,
      scope: SOURCE_BINDING_STATUS_CHANGE_SCOPE, key: command.idempotencyKey,
    });
    const cached = this.state.receipts.get(key);
    if (cached !== undefined && cached !== null) return replaySourceBindingStatusReceipt(cached);

    const binding = this.state.sourceBindingsById.get(
      monitoringSourceBindingIdKey(command.tenantId, command.workspaceId, command.sourceBindingId),
    );
    if (binding === undefined || binding.toSnapshot().interestId !== command.interestId) {
      return err(new DomainError('resource.not_found', 'Source binding not found for interest', {
        interestId: command.interestId, sourceBindingId: command.sourceBindingId,
      }));
    }
    const receiptId = [...this.state.receiptIds].find(([, receiptKey]) => receiptKey === key)?.[0] ?? params.receiptId;
    if (this.state.receiptIds.has(receiptId) && this.state.receiptIds.get(receiptId) !== key) {
      return err(new Error('Source binding status receipt identity already exists'));
    }

    const enabledCount = [...this.state.sourceBindingsById.values()]
      .map((source) => source.toSnapshot())
      .filter((source) => source.tenantId === command.tenantId &&
        source.workspaceId === command.workspaceId && source.interestId === command.interestId &&
        source.status === 'enabled').length;
    const decision = decideSourceBindingStatusChange({
      binding, desired: command.status,
      enabledCount, maximum: params.maxEnabledSourcesPerInterest,
    });
    if (!decision.ok) return decision;

    if (decision.value.result.changed &&
        this.state.events.some((event) => event.eventId === params.eventId)) {
      return err(new Error('Source binding status event identity already exists'));
    }
    const event = decision.value.result.changed
      ? sourceBindingStatusChangedEvent(params, binding, decision.value.updated)
      : undefined;
    try {
      // No await: the backing state performs a single atomic synchronous swap.
      this.state.publish({
        receiptKey: key, receiptId, receipt: decision.value.result,
        ...(event === undefined ? {} : { sourceBinding: decision.value.updated, event }),
      });
      return ok(decision.value.result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error('Source binding status commit failed'));
    }
  }
}
