import { CleanupReaderValueCacheUseCase } from './cleanup-reader-value-cache.use-case';

const first = { tenantId: 'tenant', workspaceId: 'a' };
const second = { tenantId: 'tenant', workspaceId: 'b' };
const policy = { version: 'reader-value-retention.v1', retentionHoldWorkspaceIds: null, eraseRevokedScopes: false };
const outcome = { deleted: 0, deferredActiveJob: 0, deferredHold: 0, deferredUnknownPolicy: 1 };

describe('independent reader-value cleanup', () => {
  it('rotates persisted scopes, including scopes absent from rollout, and wraps after the final scope', async () => {
    const next = jest.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
      .mockResolvedValueOnce(null).mockResolvedValueOnce(first);
    const cleanup = jest.fn().mockResolvedValue(outcome);
    const useCase = new CleanupReaderValueCacheUseCase({ next }, { cleanup }, policy);
    for (let index = 0; index < 3; index++) expect(await useCase.execute()).toEqual({ ok: true, value: outcome });
    expect(next.mock.calls).toEqual([[undefined], [first], [second], [undefined]]);
    expect(cleanup.mock.calls).toEqual([[first, policy], [second, policy], [first, policy]]);
  });

  it('preserves a failed scope cursor for retry and returns typed failures', async () => {
    const next = jest.fn().mockResolvedValue(first);
    const cleanup = jest.fn().mockRejectedValueOnce(new Error('synthetic storage failure')).mockResolvedValue(outcome);
    const useCase = new CleanupReaderValueCacheUseCase({ next }, { cleanup }, policy);
    expect(await useCase.execute()).toEqual({ ok: false, error: 'persistence_unavailable' });
    expect(await useCase.execute()).toEqual({ ok: true, value: outcome });
    expect(next.mock.calls).toEqual([[undefined], [undefined]]);
  });

  it('does not overlap ticks or increase the repository cleanup batch size', async () => {
    let finish!: (value: typeof outcome) => void;
    const cleanup = jest.fn(() => new Promise<typeof outcome>((resolve) => { finish = resolve; }));
    const next = jest.fn().mockResolvedValue(first);
    const useCase = new CleanupReaderValueCacheUseCase({ next }, { cleanup }, policy);
    const pending = useCase.execute();
    await Promise.resolve();
    expect(await useCase.execute()).toEqual({ ok: false, error: 'cleanup_busy' });
    finish(outcome);
    await pending;
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
