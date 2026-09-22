import { ok } from '@social-monitor/shared-kernel';
import { RunReaderValueTickUseCase } from './run-reader-value-tick.use-case';
import type { DiscoverReaderValueBatchUseCase } from './discover-reader-value-batch.use-case';
import type { AssessReaderValueBatchUseCase } from './assess-reader-value-batch.use-case';

const discoveryCounts = { discovered: 10, retained: 6, assessedCacheHits: 2, unsupportedKind: 1, emptyInput: 1,
  unsafeSource: 1, unavailable: 1, completedSweeps: 1, sweepDurationMs: 1234 };
const scoringCounts = { dispatched: 4, assessed: 3, failed: 1, discarded: 0, recoveredAcknowledgements: 0,
  retries: 2, unknownUsage: 1, fatalFailureCode: null, paused: false };
const scope = { tenantId: 'tenant', workspaceId: 'workspace', interestId: 'interest' };
function setup(pinnedOnly = false) {
  const discover = jest.fn().mockResolvedValue(ok(discoveryCounts));
  const assess = jest.fn().mockResolvedValue(ok(scoringCounts));
  const isPaused = jest.fn().mockReturnValue(false);
  const pauseCode = jest.fn().mockReturnValue('schema_invalid');
  const backlogAgeMs = jest.fn().mockResolvedValue(5000);
  const next = jest.fn().mockResolvedValue(null);
  const runner = new RunReaderValueTickUseCase({ execute: discover } as unknown as DiscoverReaderValueBatchUseCase,
    { execute: assess, isPaused, pauseCode } as unknown as AssessReaderValueBatchUseCase, { next },
    { discoveryScopes: pinnedOnly ? [] : [scope], backfillFrom: pinnedOnly ? null : '2026-09-01T00:00:00Z',
      modelConfigVersion: 'version', pinnedOnly }, { backlogAgeMs });
  return { runner, discover, assess, isPaused, next };
}

describe('reader-value worker tick', () => {
  it('bounds fair assessment rotation to four scopes and 100 reservations, resumes next tick', async () => {
    const f = setup();
    f.next.mockResolvedValue(scope);
    expect(await f.runner.execute()).toMatchObject({ health: 'ok', ...discoveryCounts, assessed: 12, failed: 4, retries: 8, unknownUsage: 4, backlogAgeMs: 5000 });
    expect(f.assess).toHaveBeenCalledTimes(4);
    expect(f.assess).toHaveBeenLastCalledWith({ ...scope, modelConfigVersion: 'version', limit: 25, pinnedOnly: false });
    expect(f.next.mock.calls[0]).toEqual([undefined]);
    await f.runner.execute();
    expect(f.next.mock.calls[4]).toEqual([scope]);
  });
  it('drains only pinned work for rollback and removed rollout scopes', async () => {
    const legacy = setup(true);
    legacy.next.mockResolvedValueOnce(scope);
    await legacy.runner.execute();
    expect(legacy.discover).not.toHaveBeenCalled();
    expect(legacy.assess).toHaveBeenCalledWith(expect.objectContaining({ pinnedOnly: true }));
    const shadow = setup();
    shadow.next.mockResolvedValueOnce({ ...scope, workspaceId: 'removed' });
    await shadow.runner.execute();
    expect(shadow.assess).toHaveBeenCalledWith(expect.objectContaining({ pinnedOnly: true }));
  });
  it('stops all new work after fatal pause, retaining a typed health signal', async () => {
    const f = setup();
    f.next.mockResolvedValue(scope);
    f.assess.mockResolvedValueOnce(ok({ ...scoringCounts, paused: true, fatalFailureCode: 'schema_invalid' }));
    expect(await f.runner.execute()).toMatchObject({ health: 'provider_paused', fatalFailureCode: 'schema_invalid',
      ...discoveryCounts, assessed: 3, failed: 1, retries: 2, unknownUsage: 1, backlogAgeMs: 5000 });
    expect(f.assess).toHaveBeenCalledTimes(1);
    f.isPaused.mockReturnValue(true);
    f.discover.mockClear(); f.next.mockClear();
    expect(await f.runner.execute()).toMatchObject({ health: 'provider_paused', fatalFailureCode: 'schema_invalid' });
    expect(f.discover).not.toHaveBeenCalled(); expect(f.next).not.toHaveBeenCalled();
  });
  it('returns a typed storage health signal without disclosing exceptions', async () => {
    const f = setup(); f.next.mockRejectedValue(new Error('private database details'));
    expect(await f.runner.execute()).toMatchObject({ health: 'persistence_unavailable', fatalFailureCode: 'persistence_unavailable', ...discoveryCounts });
  });
});
