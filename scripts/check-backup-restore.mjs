import { existsSync, readFileSync } from 'node:fs';

const contractPath = 'ops/recovery/backup-restore-contract.json';
const stagingReliabilityPath = 'ops/drills/staging-reliability-evidence.json';
const schemaPath = 'prisma/schema.prisma';
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const stagingReliability = JSON.parse(readFileSync(stagingReliabilityPath, 'utf8'));
const schema = readFileSync(schemaPath, 'utf8');
const violations = [];

if (contract.schemaVersion !== 1) {
  violations.push(`${contractPath}: schemaVersion must be 1`);
}

if (!Number.isInteger(contract.rpoMinutes) || contract.rpoMinutes < 1 || contract.rpoMinutes > 24 * 60) {
  violations.push(`${contractPath}: rpoMinutes must be between 1 and 1440`);
}

if (!Number.isInteger(contract.rtoMinutes) || contract.rtoMinutes < 1 || contract.rtoMinutes > 24 * 60) {
  violations.push(`${contractPath}: rtoMinutes must be between 1 and 1440`);
}

const mappedTables = [...schema.matchAll(/@@map\("([^"]+)"\)/g)].map((match) => match[1]);
const mappedTableSet = new Set(mappedTables);
const backupIncludes = new Set(contract.backupIncludes ?? []);

for (const table of mappedTables) {
  if (!backupIncludes.has(table)) {
    violations.push(`${contractPath}: backupIncludes missing Prisma table "${table}"`);
  }
}

for (const table of contract.backupIncludes ?? []) {
  if (!mappedTableSet.has(table)) {
    violations.push(`${contractPath}: backupIncludes references unknown Prisma table "${table}"`);
  }
}

for (const table of contract.operationalStateTables ?? []) {
  if (!backupIncludes.has(table)) {
    violations.push(`${contractPath}: operational state table "${table}" must be included in backups`);
  }
}

for (const required of ['outbox_events', 'inbox_records', 'idempotency_keys']) {
  if (!backupIncludes.has(required)) {
    violations.push(`${contractPath}: backup must include replay/idempotency state table "${required}"`);
  }
}

if (!Array.isArray(contract.restoreValidationQueries) || contract.restoreValidationQueries.length < 3) {
  violations.push(`${contractPath}: restoreValidationQueries must include core validation queries`);
}

validateRestoreReplayProof();

const [runbookPath, runbookAnchor] = String(contract.manualDrillRunbook ?? '').split('#');
if (!runbookPath || !existsSync(runbookPath)) {
  violations.push(`${contractPath}: manualDrillRunbook path must exist`);
} else if (!readFileSync(runbookPath, 'utf8').toLowerCase().includes((runbookAnchor ?? '').replaceAll('-', ' '))) {
  violations.push(`${contractPath}: manualDrillRunbook anchor must point to an existing runbook section`);
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Backup restore contract OK');

function validateRestoreReplayProof() {
  const proof = contract.restoreReplayProof;
  if (!isRecord(proof)) {
    violations.push(`${contractPath}: restoreReplayProof must define replay/idempotency proof requirements`);
    return;
  }

  for (const field of [
    'requiresWorkersPaused',
    'requiresReplayStateFingerprints',
    'requiresDuplicateDeliveryProbe',
    'requiresNoDuplicateDeliveryAfterRestore',
  ]) {
    if (proof[field] !== true) {
      violations.push(`${contractPath}: restoreReplayProof.${field} must be true`);
    }
  }

  const requiredSignalIds = new Set(proof.requiredEvidenceSignalIds ?? []);
  for (const signalId of [
    'postgres-outbox-inbox-idempotency',
    'postgres-worker-pause-resume',
    'postgres-no-duplicate-side-effects',
  ]) {
    if (!requiredSignalIds.has(signalId)) {
      violations.push(`${contractPath}: restoreReplayProof.requiredEvidenceSignalIds must include ${signalId}`);
    }
  }

  const stagingSignalIds = new Set((stagingReliability.requiredSignals ?? []).map((signal) => signal.signalId));
  for (const signalId of requiredSignalIds) {
    if (!stagingSignalIds.has(signalId)) {
      violations.push(`${contractPath}: restoreReplayProof signal "${signalId}" is missing from ${stagingReliabilityPath}`);
    }
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
