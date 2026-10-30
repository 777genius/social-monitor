import { DomainError, FixedClock, ok, err, type Result, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { InterestCreationCommit, InterestCreationCommitPort, InterestCreationResult } from '../../application/contracts/interest-creation-commit';
import type { IdempotencyPort } from '../../ports';
import { CreateInterestUseCase } from './create-interest.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;
  generate(): string {
    return `00000000-0000-7000-8000-${String(this.nextId++).padStart(12, '0')}`;
  }
}
const command = {
  tenantId: tenantId('tenant-1'), workspaceId: workspaceId('workspace-1'), name: ' AI Monitoring ',
  query: ' openai monitoring ', idempotencyKey: 'request-1', correlationId: 'correlation-1',
};
const now = new Date('2026-06-05T00:00:00Z');
const fixture = () => {
  const creation: InterestCreationCommitPort = {
    commit: jest.fn(async (params: InterestCreationCommit): Promise<Result<InterestCreationResult, Error>> =>
      ok({ interestId: params.interest.toSnapshot().id, created: true })),
  };
  const idempotency: Pick<IdempotencyPort, 'get'> = { get: jest.fn(async () => null) };
  const useCase = new CreateInterestUseCase(creation, idempotency, new SequenceIdGenerator(), new FixedClock(now));
  return { creation, idempotency, useCase };
};

describe('CreateInterestUseCase', () => {
  it('prepares coherent domain/event identities and commits creation through one required capability', async () => {
    const context = fixture();
    const result = await context.useCase.execute(command);
    expect(result).toEqual({ ok: true, value: { interestId: '00000000-0000-7000-8000-000000000001', created: true } });
    expect(context.creation.commit).toHaveBeenCalledTimes(1);
    const committed = jest.mocked(context.creation.commit).mock.calls[0]![0];
    expect(committed.interest.toSnapshot()).toMatchObject({ name: 'AI Monitoring', query: 'openai monitoring', createdAt: now });
    expect(committed.event).toMatchObject({
      eventId: '00000000-0000-7000-8000-000000000002', eventType: 'monitoring.interest.created', occurredAt: now,
      tenantId: command.tenantId, workspaceId: command.workspaceId,
      correlationId: command.correlationId, causationId: command.idempotencyKey,
      payload: { interestId: committed.interest.toSnapshot().id, name: 'AI Monitoring', query: 'openai monitoring' },
    });
    expect(committed.receiptId).toBe('00000000-0000-7000-8000-000000000003');
    expect(committed.idempotencyKey).toBe(command.idempotencyKey);
  });

  it('returns the original completed receipt without constructing a second creation', async () => {
    const context = fixture();
    context.idempotency.get = async <TValue>() => ({ value: { interestId: 'original-interest', created: true } as TValue });
    expect(await context.useCase.execute({ ...command, name: 'Different valid name' })).toEqual({
      ok: true, value: { interestId: 'original-interest', created: false },
    });
    expect(context.creation.commit).not.toHaveBeenCalled();
  });

  it('passes capacity into the atomic decision and returns its typed rejection', async () => {
    const context = fixture();
    const rejection = new DomainError('operation.quota_exceeded', 'Workspace interest capacity limit reached');
    jest.mocked(context.creation.commit).mockResolvedValue(err(rejection));
    const useCase = new CreateInterestUseCase(context.creation, context.idempotency,
      new SequenceIdGenerator(), new FixedClock(now), { maxInterestsPerWorkspace: 1 });
    expect(await useCase.execute(command)).toEqual({ ok: false, error: rejection });
    expect(context.creation.commit).toHaveBeenCalledWith(expect.objectContaining({ maxInterestsPerWorkspace: 1 }));
  });

  it('rejects invalid domain values before any creation write', async () => {
    const context = fixture();
    expect(await context.useCase.execute({ ...command, name: 'x' })).toMatchObject({
      ok: false, error: { code: 'validation.failed' },
    });
    expect(context.creation.commit).not.toHaveBeenCalled();
  });

  it('returns commit failure without falling back to separate repository writes', async () => {
    const context = fixture();
    const failure = new Error('Outbox persistence unavailable');
    jest.mocked(context.creation.commit).mockResolvedValue(err(failure));
    expect(await context.useCase.execute(command)).toEqual({ ok: false, error: failure });
    expect(context.creation.commit).toHaveBeenCalledTimes(1);
  });
});
