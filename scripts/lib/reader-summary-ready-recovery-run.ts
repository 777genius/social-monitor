import type { Clock } from '@social-monitor/shared-kernel';
import type { EventPublisherPort } from '@social-monitor/platform-events';
import { assertRecoveryWindow, canonicalSha256, failureCode, originalEnvelope, parseRecoveryManifest, requireRecovery } from './reader-summary-ready-recovery-manifest';
import { recoveryBefore, validateRecoveryEvidence } from './reader-summary-ready-recovery-evidence';
import type { RecoveryPersistence } from './reader-summary-ready-recovery-persistence';
import { recoveryReceipts } from './reader-summary-ready-recovery-receipts';

export async function runReadyRecovery(options: {
  bytes: Buffer; reviewedSha256: string; deployedSha: string; apply: boolean; clock: Clock;
  persistence: RecoveryPersistence; publisher: EventPublisherPort;
  // Must synchronously inhibit all future pre-wire sends, permanently, even
  // when publish() is still awaiting a connection, exchange or confirm channel.
  cancelPendingPublishes: () => void;
  receipts?: typeof recoveryReceipts; sleep: (milliseconds: number) => Promise<void>;
}): Promise<object> {
  const manifest = parseRecoveryManifest(options.bytes, options.reviewedSha256);
  requireRecovery(manifest.deployedSourceSha === options.deployedSha, 'deployed_source_mismatch');
  const journal = (options.receipts ?? recoveryReceipts)(manifest, options.bytes);
  const snapshots = await options.persistence.read(manifest.events);
  requireRecovery(snapshots.length === manifest.events.length, 'allowlist_read_mismatch');
  const states = [];
  for (const [index, entry] of manifest.events.entries()) {
    const snapshot = snapshots[index]!;
    let consumed: string | null = null;
    let validation = 'valid';
    try { consumed = await validateRecoveryEvidence(entry, snapshot); }
    catch (error) { if (options.apply) throw error; validation = failureCode(error); }
    states.push({ eventId: entry.eventId, status: snapshot.row.status, consumed, validation,
      observedPayloadSha256: canonicalSha256(snapshot.row.payload), evidence: recoveryBefore(snapshot, entry) });
  }
  const claims = journal.inspect();
  const guard = () => assertRecoveryWindow(manifest, options.deployedSha, options.clock.now());
  let eligible = true;
  try { guard(); } catch { eligible = false; }
  eligible = eligible && states.every(s => s.validation === 'valid') && !claims.operationClaimed && claims.events.every(e => !e.claimed) &&
    snapshots.every(s => s.row.status === 'FAILED' && s.row.leaseOwner === null && s.row.leasedUntil === null);
  if (!options.apply) return { mode: 'dry-run', eligible, claims, states };
  requireRecovery(eligible, 'apply_precondition_failed');
  guard(); journal.claim(); journal.before(states.map(s => s.evidence));
  for (const [index, entry] of manifest.events.entries()) {
    let row = snapshots[index]!.row;
    let publishing = false;
    let confirmed = false;
    let acknowledged = false;
    const stage = (phase: Parameters<typeof journal.stage>[1], evidence: object = {}) =>
      journal.stage(entry.eventId, phase, { at: options.clock.now().toISOString(), ...evidence });
    try {
      guard();
      // Revalidate evidence immediately before each event; CAS below also catches
      // mutations since the durable before snapshot, including mutable metadata.
      const [current] = await options.persistence.read([entry]);
      requireRecovery(current !== undefined, 'allowlisted_row_missing');
      await validateRecoveryEvidence(entry, current);
      stage('publish_started', { historicalAttempts: 'unknown', priorRecordedStarts: row.publishAttempts });
      guard(); row = await options.persistence.transition(row, 'start');
      await validateRecoveryEvidence(entry, { ...current, row });
      guard(); publishing = true;
      await boundedPublish(() => options.publisher.publish(originalEnvelope(row)), options.cancelPendingPublishes,
        Math.min(15_000, Date.parse(manifest.window.expiresAt) - options.clock.now().getTime()));
      confirmed = true; stage('confirmed');
      guard(); row = await options.persistence.transition(row, 'published');
      acknowledged = true; stage('acknowledged', { recordedStarts: row.publishAttempts });
      let consumed: string | null = null;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const [after] = await options.persistence.read([entry]);
        requireRecovery(after !== undefined, 'allowlisted_row_missing');
        requireRecovery(canonicalSha256(after.row) === canonicalSha256(row), 'acknowledged_row_changed');
        consumed = await validateRecoveryEvidence(entry, after);
        if (consumed !== null) break;
        if (attempt < 19) await options.sleep(250);
      }
      requireRecovery(consumed !== null, 'consumer_outcome_uncertain');
      stage('consumed', { realtimeEventId: consumed, duplicateBefore: states[index]!.consumed !== null });
    } catch (error) {
      options.cancelPendingPublishes();
      // Never change a confirmed send into an ordinary failed/no-send outcome.
      // Persist uncertainty BEFORE any best-effort failure diagnostic write.
      stage('uncertain', { publishing, confirmed, acknowledged, failure: failureCode(error) });
      if (publishing && !confirmed) {
        try { guard(); await options.persistence.transition(row, 'failed'); } catch { /* CAS/DB uncertainty is retained. */ }
      }
      throw error;
    }
  }
  return { mode: 'apply', operationId: manifest.operationId, consumed: manifest.events.length };
}
async function boundedPublish(work: () => Promise<void>, cancel: () => void, milliseconds: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([work(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { cancel(); reject(new Error('publish deadline; wire outcome uncertain')); }, milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
