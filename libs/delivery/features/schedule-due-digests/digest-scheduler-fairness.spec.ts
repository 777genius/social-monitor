import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { DigestSchedule } from '../../domain';
import type { DueDigestContinuation } from './schedule-due-digests.command';
import {
  recoveryNow,
  recoveryTenant,
  recoveryWorkspace,
  setupDigestRecovery,
} from '../../../../test/support/digest-delivery-recovery-fixture';

describe('due digest bounded page progress', () => {
  it('visits every failed schedule across bounded pages instead of repeating the first page', async () => {
    const d = setupDigestRecovery();
    for (const id of ['a', 'b', 'c', 'd', 'e']) await d.addSchedule(id, 'recipient-' + id);
    const assemble = jest.spyOn(d.assemble, 'execute').mockRejectedValue(new Error('unavailable'));
    const findDue = jest.spyOn(d.schedules, 'findDue');
    let continuation: DueDigestContinuation | undefined;
    for (let tick = 0; tick < 3; tick += 1) {
      const result = await d.scheduler.execute({ limit: 2, continuation });
      if (!result.ok) throw result.error;
      expect(result.value.evaluated).toBeLessThanOrEqual(2);
      continuation = result.value.continuation;
    }
    expect(assemble.mock.calls.map(([command]) => command.recipientKey)).toEqual([
      'recipient-a', 'recipient-b', 'recipient-c', 'recipient-d', 'recipient-e',
    ]);
    expect(findDue).toHaveBeenCalledTimes(3);
    expect(continuation).toBeUndefined();
  });

  it('uses the original due timestamp even after advancing the last schedule', async () => {
    const d = setupDigestRecovery();
    await d.addSchedule('schedule-a');
    const result = await d.scheduler.execute({ limit: 1 });
    if (!result.ok) throw result.error;
    expect(result.value.continuation).toEqual({
      tenantId: undefined,
      workspaceId: undefined,
      dueBefore: recoveryNow,
      nextRunAt: recoveryNow,
      id: 'schedule-a',
    });
    expect((await d.findSchedule('schedule-a'))?.toSnapshot().nextRunAt)
      .toEqual(new Date('2026-11-27T02:00:00.000Z'));
    const findDue = jest.spyOn(d.schedules, 'findDue');
    const empty = await d.scheduler.execute({ limit: 1, continuation: result.value.continuation });
    expect(empty).toMatchObject({ ok: true, value: { evaluated: 0 } });
    expect(findDue).toHaveBeenCalledTimes(2);
  });

  it('admits newly due windows when the previous sweep ends', async () => {
    const d = setupDigestRecovery();
    await d.addSchedule('schedule-a');
    const first = await d.scheduler.execute({ limit: 1 });
    if (!first.ok) throw first.error;

    jest.spyOn(d.clock, 'now').mockReturnValue(new Date('2026-11-27T02:00:00.000Z'));
    const next = await d.scheduler.execute({ limit: 1, continuation: first.value.continuation });
    expect(next).toMatchObject({ ok: true, value: { assembled: 1 } });
    expect((await d.findSchedule('schedule-a'))?.toSnapshot().nextRunAt)
      .toEqual(new Date('2026-11-27T03:00:00.000Z'));
    expect(await d.listAttempts()).toHaveLength(2);
  });

  it('retries a failed head when later schedules become due again between ticks', async () => {
    const d = setupDigestRecovery();
    await d.addSchedule('schedule-a', 'poison-recipient');
    await d.addSchedule('schedule-b', 'healthy-recipient');
    let now = recoveryNow;
    jest.spyOn(d.clock, 'now').mockImplementation(() => new Date(now));
    const persist = d.attempts.save.bind(d.attempts);
    jest.spyOn(d.attempts, 'save').mockRejectedValueOnce(new Error('delivery unavailable'))
      .mockImplementation(persist);

    let continuation: DueDigestContinuation | undefined;
    for (let tick = 0; tick < 3; tick += 1) {
      now = new Date(recoveryNow.getTime() + tick * 3_600_000);
      const result = await d.scheduler.execute({ limit: 1, continuation });
      if (!result.ok) throw result.error;
      expect(result.value.scannedAt).toEqual(now);
      expect(result.value.evaluated).toBe(1);
      continuation = result.value.continuation;
    }

    expect((await d.findSchedule('schedule-a'))?.toSnapshot().nextRunAt)
      .toEqual(new Date('2026-11-27T02:00:00.000Z'));
    expect((await d.findSchedule('schedule-b'))?.toSnapshot().nextRunAt)
      .toEqual(new Date('2026-11-27T02:00:00.000Z'));
    expect((await d.listAttempts()).map((attempt) => attempt.toSnapshot().recipientKey))
      .toEqual(['poison-recipient', 'healthy-recipient']);
    expect(d.sources.readWindow).toHaveBeenCalledTimes(2);
  });

  it('drops continuation from a different scope and never evaluates that tenant', async () => {
    const d = setupDigestRecovery();
    const schedule = await d.addSchedule('schedule-a');
    await d.schedules.save(DigestSchedule.create({
      ...schedule.toSnapshot(),
      id: 'foreign',
      tenantId: tenantId('other-tenant'),
      workspaceId: workspaceId('other-workspace'),
    }));
    const findDue = jest.spyOn(d.schedules, 'findDue');
    const result = await d.scheduler.execute({
      tenantId: recoveryTenant,
      workspaceId: recoveryWorkspace,
      limit: 2,
      continuation: {
        tenantId: tenantId('other-tenant'),
        workspaceId: workspaceId('other-workspace'),
        dueBefore: new Date('2027-01-01T00:00:00.000Z'),
        nextRunAt: recoveryNow,
        id: 'foreign',
      },
    });
    expect(result).toMatchObject({ ok: true, value: { evaluated: 1 } });
    expect(findDue).toHaveBeenCalledWith({
      tenantId: recoveryTenant, workspaceId: recoveryWorkspace, now: recoveryNow, limit: 2,
    });
    expect(d.sources.readWindow).toHaveBeenCalledTimes(1);
    expect(d.sources.readWindow).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: recoveryTenant, workspaceId: recoveryWorkspace,
    }));
  });

  it('rejects incomplete scope before polling', async () => {
    const d = setupDigestRecovery();
    const findDue = jest.spyOn(d.schedules, 'findDue');
    await expect(d.scheduler.execute({ tenantId: recoveryTenant, limit: 1 }))
      .resolves.toMatchObject({ ok: false, error: { code: 'tenant.scope_missing' } });
    expect(findDue).not.toHaveBeenCalled();
  });
});
