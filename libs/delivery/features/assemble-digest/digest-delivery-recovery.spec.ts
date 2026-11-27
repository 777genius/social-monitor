import { recoveryCommand, setupDigestRecovery } from '../../../../test/support/digest-delivery-recovery-fixture';

describe('digest delivery handoff recovery', () => {
  it('repairs a saved digest after delivery admission fails without rereading sources', async () => {
    const d = setupDigestRecovery();
    jest.spyOn(d.attempts, 'save').mockRejectedValueOnce(new Error('database unavailable'));
    expect((await d.assemble.execute(recoveryCommand)).ok).toBe(false);
    const repaired = await d.assemble.execute({ ...recoveryCommand, interestIds: ['changed-interest'] });
    expect(repaired).toMatchObject({ ok: true, value: { created: false, deliveryAttemptId: expect.any(String) } });
    if (!repaired.ok) throw repaired.error;
    const attempts = await d.listAttempts();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.toSnapshot()).toMatchObject({
      resourceId: repaired.value.digest.id,
      idempotencyKey: expect.stringContaining(repaired.value.digest.contentHash),
    });
    expect(repaired.value.digest.provenance[0]?.interestId).toBe('interest-a');
    expect(d.sources.readWindow).toHaveBeenCalledTimes(1);
  });

  it('converges simultaneous retries on the same durable attempt', async () => {
    const d = setupDigestRecovery();
    jest.spyOn(d.attempts, 'save').mockRejectedValueOnce(new Error('database unavailable'));
    await d.assemble.execute(recoveryCommand);
    const [first, second] = await Promise.all([
      d.assemble.execute(recoveryCommand), d.assemble.execute(recoveryCommand),
    ]);
    if (!first.ok || !second.ok) throw new Error('Both repairs must succeed');
    expect(first.value.deliveryAttemptId).toBe(second.value.deliveryAttemptId);
    expect(await d.listAttempts()).toHaveLength(1);
    expect(d.sources.readWindow).toHaveBeenCalledTimes(1);
  });

  it('keeps the retry policy of an already admitted delivery attempt', async () => {
    const d = setupDigestRecovery();
    const first = await d.assemble.execute({ ...recoveryCommand, maxRetries: 7 });
    const second = await d.assemble.execute({ ...recoveryCommand, maxRetries: 1 });
    if (!first.ok || !second.ok) throw new Error('Expected digest');
    expect(second.value.deliveryAttemptId).toBe(first.value.deliveryAttemptId);
    expect((await d.listAttempts())[0]?.toSnapshot().maxRetries).toBe(7);
  });

  it('keeps an existing empty digest empty without admitting delivery', async () => {
    const d = setupDigestRecovery();
    d.sources.readWindow.mockResolvedValue({ summaries: [], feedItems: [] });
    await d.assemble.execute(recoveryCommand);
    const replay = await d.assemble.execute(recoveryCommand);
    expect(replay).toMatchObject({ ok: true, value: { created: false, digest: { status: 'empty' } } });
    if (!replay.ok) throw replay.error;
    expect(replay.value.deliveryAttemptId).toBeUndefined();
    expect(await d.listAttempts()).toHaveLength(0);
    expect(d.sources.readWindow).toHaveBeenCalledTimes(1);
  });

  it('does not report success while delivery admission remains unavailable', async () => {
    const d = setupDigestRecovery();
    jest.spyOn(d.attempts, 'save').mockRejectedValue(new Error('database unavailable'));
    expect((await d.assemble.execute(recoveryCommand)).ok).toBe(false);
    expect((await d.assemble.execute(recoveryCommand)).ok).toBe(false);
    expect(await d.listAttempts()).toHaveLength(0);
    expect(d.sources.readWindow).toHaveBeenCalledTimes(1);
  });
});
