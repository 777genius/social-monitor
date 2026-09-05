import { readyRecoveryFixture } from './reader-summary-ready-recovery-fixture';
import { bytesSha256, canonicalSha256, parseRecoveryManifest } from './reader-summary-ready-recovery-manifest';
import { runReadyRecovery } from './reader-summary-ready-recovery-run';

describe('one-shot reader ready recovery', () => {
  let f: ReturnType<typeof readyRecoveryFixture>;
  beforeEach(() => { f = readyRecoveryFixture(); });
  afterEach(() => f.cleanup());

  it('defaults to inspection and never sends on a precondition error', async () => {
    expect(await f.run(false)).toMatchObject({ eligible: true, mode: 'dry-run' });
    f.snapshots[0]!.row = { ...f.snapshots[0]!.row, status: 'PENDING' };
    await expect(f.run()).rejects.toThrow('apply_precondition_failed');
    expect(f.channel.publish).not.toHaveBeenCalled(); expect(f.db.outboxEvent.update).not.toHaveBeenCalled();
  });
  it.each(['scope', 'payload', 'legacy', 'proof', 'report', 'missing retained projection'])('fails closed before send for %s', async risk => {
    const s = f.snapshots[0]!;
    if (risk === 'scope') s.row = { ...s.row, workspaceId: '00000000-0000-4000-8000-000000000099' };
    if (risk === 'payload') s.row = { ...s.row, payload: { changed: true } };
    if (risk === 'legacy') s.row = { ...s.row, eventType: 'summary.ready' };
    if (risk === 'proof') s.publication!.exactProof = { changed: true };
    if (risk === 'report') s.publication!.readerSummaryArtifact.summaryText = 'changed';
    if (risk === 'missing retained projection') { await f.consume(); s.projections = []; }
    await expect(f.run()).rejects.toThrow(); expect(f.channel.publish).not.toHaveBeenCalled();
  });
  it('rejects tampered, oversized, duplicate and outside-allowlist manifests', async () => {
    const options = f.options();
    expect(() => parseRecoveryManifest(Buffer.from(options.bytes.toString().replace('FAILED', 'PENDING')), options.reviewedSha256)).toThrow('manifest_digest');
    f.manifest.events[0]!.eventId = '00000000-0000-4000-8000-000000000999';
    await expect(f.run()).rejects.toThrow('allowlisted_row_missing');
    f.manifest.events = Array.from({ length: 18 }, () => f.manifest.events[0]!);
    const bytes = Buffer.from(JSON.stringify(f.manifest));
    expect(() => parseRecoveryManifest(bytes, bytesSha256(bytes))).toThrow('manifest_invalid');
    f.manifest.events.pop(); await expect(f.run()).rejects.toThrow('duplicate_allowlist');
    expect(f.channel.publish).not.toHaveBeenCalled();
  });
  it('publishes exact original envelope bytes and records distinct confirmation, acknowledgement and consumption', async () => {
    const row = structuredClone(f.snapshots[0]!.row);
    expect(await f.run()).toMatchObject({ consumed: 1 });
    const expected = Buffer.from(JSON.stringify({ eventId: row.id, eventType: row.eventType, schemaVersion: 1,
      occurredAt: row.createdAt.toISOString(), tenantId: row.tenantId, workspaceId: row.workspaceId,
      correlationId: row.correlationId, causationId: row.causationId, payload: row.payload }));
    expect(f.channel.publish).toHaveBeenCalledWith('social-monitor.events', 'reader_summary.ready', expected,
      expect.objectContaining({ mandatory: true, messageId: row.id, deliveryMode: 2 }));
    expect(f.receipt('claim')).toBe(f.options().bytes.toString());
    for (const phase of ['publish_started', 'confirmed', 'acknowledged', 'consumed']) expect(f.receipt(`${row.id}.${phase}`)).toContain(phase);
    expect(f.snapshots[0]!.row).toMatchObject({ status: 'PUBLISHED', publishAttempts: 1, lastError: null });
    await expect(f.run()).rejects.toThrow(); expect(f.channel.publish).toHaveBeenCalledTimes(1);
    expect(await f.run(false)).toMatchObject({ eligible: false });
  });
  it('rejects a simultaneous apply and never releases the durable operation claim', async () => {
    let release!: () => void; let arrived!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { arrived = resolve; });
    f.channel.waitForConfirms.mockImplementation(async () => { arrived(); await blocked; await f.consume(); });
    const first = f.run(); await started;
    await expect(f.run()).rejects.toThrow('apply_precondition_failed');
    release(); await first; expect(f.channel.publish).toHaveBeenCalledTimes(1);
  });
  it('retains uncertainty after broker confirm then DB failure, permits inspection and stops the rest', async () => {
    f.cleanup(); f = readyRecoveryFixture(2);
    const transition = f.persistence.transition;
    f.persistence.transition = async (row, action) => { if (action === 'published') throw new Error('fixture-secret'); return transition(row, action); };
    await expect(f.run()).rejects.toThrow('fixture-secret');
    expect(JSON.parse(f.receipt(`${f.snapshots[0]!.row.id}.uncertain`))).toMatchObject({ confirmed: true, acknowledged: false, failure: 'dependency_failed' });
    expect(f.channel.publish).toHaveBeenCalledTimes(1);
    expect(await f.run(false)).toMatchObject({ eligible: false });
    await expect(f.run()).rejects.toThrow(); expect(f.channel.publish).toHaveBeenCalledTimes(1);
  });
  it('uses the same retained identity for a duplicate without forging an inbox', async () => {
    await f.consume(); const before = canonicalSha256(f.snapshots[0]!.projections);
    await f.run(); expect(canonicalSha256(f.snapshots[0]!.projections)).toBe(before);
    expect(JSON.parse(f.receipt(`${f.snapshots[0]!.row.id}.consumed`))).toMatchObject({ duplicateBefore: true });
  });
  it('stops on a publish failure with no acknowledgement and sanitizes retained diagnostics', async () => {
    f.channel.waitForConfirms.mockRejectedValue(new Error('access_token=fixture-secret'));
    await expect(f.run()).rejects.toThrow();
    expect(f.snapshots[0]!.row.status).toBe('FAILED'); expect(f.snapshots[0]!.row.publishAttempts).toBe(1);
    expect(f.receipt('before')).not.toContain('fixture-secret');
    expect(f.receipt(`${f.snapshots[0]!.row.id}.uncertain`)).not.toContain('fixture-secret');
  });
  it('bounds consumer delay and never automatically resends a confirmed event', async () => {
    f.channel.waitForConfirms.mockResolvedValue(undefined);
    const sleep = jest.fn(async () => undefined);
    await expect(runReadyRecovery({ ...f.options(), sleep })).rejects.toThrow('consumer_outcome_uncertain');
    expect(sleep).toHaveBeenCalledTimes(19); expect(f.channel.publish).toHaveBeenCalledTimes(1);
    await f.consume(); expect(await f.run(false)).toMatchObject({ eligible: false });
    await expect(f.run()).rejects.toThrow();
  });
  it('does not silently acknowledge payload mutation between confirm and DB acknowledgement', async () => {
    f.channel.waitForConfirms.mockImplementation(async () => { f.snapshots[0]!.row = { ...f.snapshots[0]!.row, payload: { altered: true } }; });
    await expect(f.run()).rejects.toThrow('outbox_concurrent_mutation');
    expect(f.snapshots[0]!.row.status).toBe('FAILED');
    expect(JSON.parse(f.receipt(`${f.snapshots[0]!.row.id}.uncertain`))).toMatchObject({ confirmed: true, acknowledged: false });
  });
});
