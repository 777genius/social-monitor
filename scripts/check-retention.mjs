import { existsSync, readFileSync } from 'node:fs';

const contractPath = 'ops/privacy/retention-contract.json';
const schemaPath = 'prisma/schema.prisma';
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const schema = readFileSync(schemaPath, 'utf8');
const violations = [];

if (contract.schemaVersion !== 1) {
  violations.push(`${contractPath}: schemaVersion must be 1`);
}

if (contract.defaultLegalHoldBehavior !== 'skip_purge_and_record_exception') {
  violations.push(`${contractPath}: defaultLegalHoldBehavior must be skip_purge_and_record_exception`);
}

const mappedTables = [...schema.matchAll(/@@map\("([^"]+)"\)/g)].map((match) => match[1]);
const mappedTableSet = new Set(mappedTables);
const tablePolicies = contract.tables ?? [];
const policyByTable = new Map();

for (const policy of tablePolicies) {
  if (policyByTable.has(policy.table)) {
    violations.push(`${contractPath}: duplicate retention policy for table "${policy.table}"`);
  }
  policyByTable.set(policy.table, policy);
}

for (const table of mappedTables) {
  if (!policyByTable.has(table)) {
    violations.push(`${contractPath}: missing retention policy for Prisma table "${table}"`);
  }
}

for (const policy of tablePolicies) {
  if (!mappedTableSet.has(policy.table)) {
    violations.push(`${contractPath}: retention policy references unknown Prisma table "${policy.table}"`);
  }

  for (const field of ['table', 'dataClass', 'owner', 'deleteMode', 'purgeTrigger']) {
    if (typeof policy[field] !== 'string' || policy[field].trim().length === 0) {
      violations.push(`${contractPath}: policy for "${policy.table}" must define non-empty ${field}`);
    }
  }

  if (!Number.isInteger(policy.retentionDays) || policy.retentionDays < 0 || policy.retentionDays > 3650) {
    violations.push(`${contractPath}: policy for "${policy.table}" retentionDays must be 0..3650`);
  }

  if (typeof policy.exportable !== 'boolean') {
    violations.push(`${contractPath}: policy for "${policy.table}" exportable must be boolean`);
  }

  if (typeof policy.legalHoldAware !== 'boolean') {
    violations.push(`${contractPath}: policy for "${policy.table}" legalHoldAware must be boolean`);
  }

  if (policy.retentionDays === 0 && !String(policy.deleteMode).startsWith('retain_until_')) {
    violations.push(`${contractPath}: policy for "${policy.table}" with retentionDays 0 must use retain_until_* deleteMode`);
  }
}

for (const requiredTable of ['users', 'source_items', 'summary_artifacts', 'usage_records', 'outbox_events', 'idempotency_keys']) {
  if (!policyByTable.has(requiredTable)) {
    violations.push(`${contractPath}: missing critical retention table "${requiredTable}"`);
  }
}

for (const exportableTable of ['users', 'memberships', 'topics', 'source_bindings', 'source_items', 'feed_items', 'summary_artifacts', 'summary_feedback', 'usage_records']) {
  if (policyByTable.get(exportableTable)?.exportable !== true) {
    violations.push(`${contractPath}: "${exportableTable}" must be exportable for MVP DSAR/export coverage`);
  }
}

for (const operationalTable of ['outbox_events', 'inbox_records', 'idempotency_keys', 'cursor_checkpoints']) {
  const policy = policyByTable.get(operationalTable);
  if (policy?.exportable !== false) {
    violations.push(`${contractPath}: operational table "${operationalTable}" must not be user-exportable`);
  }
  if (policy?.retentionDays > 365) {
    violations.push(`${contractPath}: operational table "${operationalTable}" retentionDays must be <= 365`);
  }
}

const [runbookPath, runbookAnchor] = String(contract.runbook ?? '').split('#');
if (!runbookPath || !existsSync(runbookPath)) {
  violations.push(`${contractPath}: runbook path must exist`);
} else if (!readFileSync(runbookPath, 'utf8').toLowerCase().includes((runbookAnchor ?? '').replaceAll('-', ' '))) {
  violations.push(`${contractPath}: runbook anchor must point to an existing runbook section`);
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Retention contract OK');
