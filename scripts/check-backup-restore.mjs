import { existsSync, readFileSync } from 'node:fs';

const contractPath = 'ops/recovery/backup-restore-contract.json';
const schemaPath = 'prisma/schema.prisma';
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
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
