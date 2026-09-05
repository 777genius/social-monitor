import { readyRecoveryFixture } from './reader-summary-ready-recovery-fixture';
import { main, recoveryArguments } from '../recover-reader-summary-ready-events';
import { runReadyRecovery } from './reader-summary-ready-recovery-run';

describe('reader ready recovery safety guards', () => {
  let f: ReturnType<typeof readyRecoveryFixture>;
  beforeEach(() => { f = readyRecoveryFixture(); });
  afterEach(() => f.cleanup());
  it('requires explicit configuration and has no ambient DATABASE_URL fallback', async () => {
    expect(recoveryArguments(['--manifest', '/synthetic.json'])).toEqual({ manifestPath: '/synthetic.json', apply: false });
    expect(() => recoveryArguments(['--manifest', '/synthetic.json', '--apply', '--dry-run'])).toThrow();
    await expect(main(['--manifest', '/synthetic.json'], { DATABASE_URL: 'synthetic-unused' })).rejects.toThrow('explicit_recovery_config_required');
  });
  it('rejects wrong deployment SHA and closed windows before any effects, but allows later inspection', async () => {
    await expect(runReadyRecovery({ ...f.options(), deployedSha: 'b'.repeat(40) })).rejects.toThrow('deployed_source_mismatch');
    const options = { ...f.options(), clock: { now: () => new Date('2026-09-06T00:00:00.000Z') } };
    await expect(runReadyRecovery(options)).rejects.toThrow('apply_precondition_failed');
    expect(await runReadyRecovery({ ...options, apply: false })).toMatchObject({ eligible: false });
    expect(f.channel.publish).not.toHaveBeenCalled();
  });
  it('validates the complete allowlist before sending its first row', async () => {
    f.cleanup(); f = readyRecoveryFixture(2);
    f.snapshots[1]!.row = { ...f.snapshots[1]!.row, payload: {} };
    await expect(f.run()).rejects.toThrow('outbox_identity_mismatch');
    expect(f.db.outboxEvent.update).not.toHaveBeenCalled(); expect(f.channel.publish).not.toHaveBeenCalled();
  });
  it.each(['payload', 'tenant', 'schema', 'orphan', 'duplicate'])('rejects retained %s mismatch and still exposes inspection evidence', async risk => {
    await f.consume(); const s = f.snapshots[0]!;
    if (risk === 'payload') s.projections = [{ ...s.projections[0]!, payload: { altered: true } }];
    if (risk === 'tenant') s.projections = [{ ...s.projections[0]!, tenantId: 'foreign' }];
    if (risk === 'schema') s.inbox = { ...s.inbox!, schemaVersion: 2 };
    if (risk === 'orphan') s.inbox = null;
    if (risk === 'duplicate') s.projections = [...s.projections, { ...s.projections[0]!, id: 'duplicate' }];
    await expect(f.run()).rejects.toThrow(); expect(f.channel.publish).not.toHaveBeenCalled();
    expect(await f.run(false)).toMatchObject({ eligible: false, states: [{ eventId: s.row.id, status: 'FAILED' }] });
  });
  it('requires durable before evidence and blocks overlapping manifests after any claimed invocation', async () => {
    const options = f.options();
    await expect(runReadyRecovery({ ...options, receipts: (m, b) => ({ ...options.receipts(m, b),
      before: () => { throw new Error('synthetic disk failure'); } }) })).rejects.toThrow('synthetic disk failure');
    expect(f.channel.publish).not.toHaveBeenCalled();
    f.manifest.operationId = '00000000-0000-4000-8000-000000000888';
    await expect(f.run()).rejects.toThrow('apply_precondition_failed');
  });
  it('stops after a receipt failure following confirmation, without acknowledging the outbox', async () => {
    const options = f.options();
    await expect(runReadyRecovery({ ...options, receipts: (m, b) => {
      const receipts = options.receipts(m, b);
      return { ...receipts, stage: (id, phase, evidence) => {
        if (phase === 'confirmed') throw new Error('synthetic fsync failure');
        receipts.stage(id, phase, evidence);
      } };
    } })).rejects.toThrow('synthetic fsync failure');
    expect(f.channel.publish).toHaveBeenCalledTimes(1); expect(f.snapshots[0]!.row.status).toBe('FAILED');
    expect(JSON.parse(f.receipt(`${f.snapshots[0]!.row.id}.uncertain`))).toMatchObject({ confirmed: true, acknowledged: false });
  });
  it('accepts asynchronously committed consumption without republishing', async () => {
    f.channel.waitForConfirms.mockResolvedValue(undefined);
    const sleep = jest.fn(async () => { await f.consume(); });
    expect(await runReadyRecovery({ ...f.options(), sleep })).toMatchObject({ consumed: 1 });
    expect(sleep).toHaveBeenCalledTimes(1); expect(f.channel.publish).toHaveBeenCalledTimes(1);
  });
});
