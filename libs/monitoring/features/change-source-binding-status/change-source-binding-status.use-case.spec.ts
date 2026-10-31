import { DomainError, FixedClock, ok, err, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type {
  SourceBindingStatusChange,
  SourceBindingStatusChangeCommitPort,
} from '../../application/contracts/source-binding-status-change-commit';
import { ChangeSourceBindingStatusUseCase } from './change-source-binding-status.use-case';

const at = new Date('2026-10-31T00:00:00.000Z');
const command = {
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  interestId: 'interest-1',
  sourceBindingId: 'binding-1',
  status: 'enabled' as const,
  idempotencyKey: 'resume-1',
  correlationId: 'correlation-1',
};

describe('ChangeSourceBindingStatusUseCase', () => {
  it('delegates the scoped command, event/receipt identities and configured quota to one commit', async () => {
    const change = jest.fn(async (params: SourceBindingStatusChange) => {
      void params;
      return ok({ sourceBindingId: command.sourceBindingId, status: command.status, changed: true });
    });
    const ids = { generate: jest.fn().mockReturnValueOnce('receipt-1').mockReturnValueOnce('event-1') };
    const useCase = new ChangeSourceBindingStatusUseCase(
      { change }, ids, new FixedClock(at), { maxEnabledSourcesPerInterest: 2 },
    );

    await expect(useCase.execute(command)).resolves.toEqual({
      ok: true, value: { sourceBindingId: 'binding-1', status: 'enabled', changed: true },
    });
    expect(change).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledWith({
      command, receiptId: 'receipt-1', eventId: 'event-1', occurredAt: at,
      maxEnabledSourcesPerInterest: 2,
    });
  });

  it('propagates a quota rejection without attempting a separate persistence fallback', async () => {
    const failure = new DomainError('operation.quota_exceeded', 'Interest source binding capacity limit reached');
    const change: SourceBindingStatusChangeCommitPort['change'] = async () => err(failure);
    const useCase = new ChangeSourceBindingStatusUseCase(
      { change }, { generate: () => 'test-id' }, new FixedClock(at),
    );
    await expect(useCase.execute(command)).resolves.toEqual({ ok: false, error: failure });
  });
});
