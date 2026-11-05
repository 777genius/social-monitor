import { installSecureRecoveryEvidenceFile, readSecureRecoveryEvidenceFile,
  type RecoveryEvidenceFilesystemTestHarness } from './reader-summary-recovery-evidence-secure-file';
import { bytesSha256, requireRecovery, type RecoveryManifest } from './reader-summary-ready-recovery-manifest';

export const recoveryPhases = ['publish_started', 'confirmed', 'acknowledged', 'consumed', 'uncertain'] as const;
type Phase = typeof recoveryPhases[number];
export function recoveryReceipts(manifest: RecoveryManifest, bytes: Buffer,
  files: RecoveryEvidenceFilesystemTestHarness = { read: readSecureRecoveryEvidenceFile, install: installSecureRecoveryEvidenceFile }) {
  const root = 'reader-summary-ready-recovery';
  const prefix = `${root}/${manifest.operationId}`;
  const eventClaim = (id: string) => `${root}/events/${id}.json`;
  const read = (relativePath: string): Buffer | null => {
    try { return files.read({ relativePath, label: 'reader ready receipt' }); }
    catch (error) {
      if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    }
  };
  const install = (relativePath: string, content: Buffer): void => {
    requireRecovery(files.install({ relativePath, label: 'reader ready receipt', bytes: content }) === 'installed', 'operation_already_claimed');
  };
  const write = (name: string, value: object) => install(`${prefix}/${name}.json`, Buffer.from(JSON.stringify(value) + '\n'));
  return {
    inspect: () => ({ operationClaimed: read(`${prefix}/claim.json`) !== null,
      events: manifest.events.map(e => ({ eventId: e.eventId, claimed: read(eventClaim(e.eventId)) !== null,
        phases: recoveryPhases.filter(phase => read(`${prefix}/${e.eventId}.${phase}.json`) !== null) })) }),
    claim: () => {
      install(`${prefix}/claim.json`, bytes);
      for (const e of manifest.events) install(eventClaim(e.eventId), Buffer.from(JSON.stringify({
        operationId: manifest.operationId, manifestSha256: bytesSha256(bytes), eventId: e.eventId,
      }) + '\n'));
    },
    before: (snapshots: readonly object[]) => write('before', { manifestSha256: bytesSha256(bytes), snapshots }),
    stage: (eventId: string, phase: Phase, evidence: object) => {
      requireRecovery(manifest.events.some(e => e.eventId === eventId), 'event_outside_allowlist');
      write(`${eventId}.${phase}`, { operationId: manifest.operationId, eventId, phase,
        manifestSha256: bytesSha256(bytes), ...evidence });
    },
  };
}
