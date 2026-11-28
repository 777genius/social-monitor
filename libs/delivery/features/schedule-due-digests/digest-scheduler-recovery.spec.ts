import { DigestSchedule } from '../../domain';
import { recoveryNow, setupDigestRecovery } from '../../../../test/support/digest-delivery-recovery-fixture';

describe('digest schedule recovery and sibling isolation', () => {
  it('keeps a failed delivery handoff due and advances only after repairing it', async () => {
    const d = setupDigestRecovery();
    await d.addSchedule('schedule-a');
    jest.spyOn(d.attempts, 'save').mockRejectedValueOnce(new Error('temporary delivery admission failure'));
    const first = await d.tick();
    expect(first).toMatchObject({ evaluated: 1, assembled: 0, skipped: 1, failures: [{ digestScheduleId: 'schedule-a' }] });
    expect((await d.findSchedule('schedule-a'))?.toSnapshot().nextRunAt).toEqual(recoveryNow);
    const second = await d.tick();
    expect(second).toMatchObject({ evaluated: 1, assembled: 1, skipped: 0 });
    expect(second.failures).toBeUndefined();
    expect((await d.findSchedule('schedule-a'))?.toSnapshot().nextRunAt).toEqual(new Date('2026-11-27T02:00:00.000Z'));
    expect(await d.listAttempts()).toHaveLength(1);
    expect(d.sources.readWindow).toHaveBeenCalledTimes(1);
  });

  it('continues a healthy sibling after a source failure and bounds diagnostic text', async () => {
    const d = setupDigestRecovery();
    await d.addSchedule('schedule-a', 'recipient-a');
    await d.addSchedule('schedule-b', 'recipient-b');
    d.sources.readWindow.mockRejectedValueOnce(new Error('source unavailable\n' + 'x'.repeat(500)));
    const result = await d.tick();
    expect(result).toMatchObject({ evaluated: 2, assembled: 1, skipped: 1 });
    expect(result.digests[0]?.digestScheduleId).toBe('schedule-b');
    expect(result.failures?.[0]?.message.length).toBeLessThanOrEqual(240);
    expect(result.failures?.[0]?.message).not.toMatch(/[\r\n]/);
    expect((await d.findSchedule('schedule-a'))?.toSnapshot().nextRunAt).toEqual(recoveryNow);
  });

  it('repairs a schedule-save failure without duplicating an admitted delivery', async () => {
    const d = setupDigestRecovery();
    await d.addSchedule('schedule-a', 'recipient-a');
    await d.addSchedule('schedule-b', 'recipient-b');
    jest.spyOn(d.schedules, 'save').mockRejectedValueOnce(new Error('schedule write unavailable'));
    const first = await d.tick();
    expect(first).toMatchObject({ evaluated: 2, assembled: 1, skipped: 1 });
    expect(first.digests[0]?.digestScheduleId).toBe('schedule-b');
    expect(await d.listAttempts()).toHaveLength(2);
    expect((await d.findSchedule('schedule-a'))?.toSnapshot().nextRunAt).toEqual(recoveryNow);
    const second = await d.tick();
    expect(second).toMatchObject({ evaluated: 1, assembled: 1, skipped: 0 });
    expect(await d.listAttempts()).toHaveLength(2);
    expect(d.sources.readWindow).toHaveBeenCalledTimes(2);
  });

  it('repairs from persisted digest identity after schedule interests change', async () => {
    const d = setupDigestRecovery();
    const schedule = await d.addSchedule('schedule-a');
    jest.spyOn(d.attempts, 'save').mockRejectedValueOnce(new Error('temporary delivery admission failure'));
    await d.tick();
    await d.schedules.save(DigestSchedule.create({ ...schedule.toSnapshot(), interestIds: ['changed-interest'] }));
    const repaired = await d.tick();
    const digest = await d.digests.findById({
      tenantId: schedule.toSnapshot().tenantId, workspaceId: schedule.toSnapshot().workspaceId,
      digestId: repaired.digests[0]!.digestId,
    });
    expect(digest?.toSnapshot().provenance[0]?.interestId).toBe('interest-a');
    expect((await d.listAttempts())[0]?.toSnapshot().maxRetries).toBe(3);
    expect(d.sources.readWindow).toHaveBeenCalledTimes(1);
  });
});
