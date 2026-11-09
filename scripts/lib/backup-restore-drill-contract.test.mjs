import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  compileBackupRestoreDrillContract,
  compareTableCoverage,
  parseNonNegativeCount,
  parseRestoreValidationTable,
  restoreDrillContractFingerprints,
} from './backup-restore-drill-contract.mjs';
import { validatePostgresRestoreEvidence } from './postgres-restore-evidence-validator.mjs';

test('parses the reviewed count query grammar', () => {
  assert.equal(parseRestoreValidationTable('select count(*) from feed_items'), 'feed_items');
  for (const invalid of [
    'select * from feed_items',
    'select count(*) from FeedItems',
    'select count(*) from feed_items;',
    'select count(*) from feed_items\n',
    'select count(*) from feed_items -- comment',
    'select count(*) from feed_items; select 1',
    'select count(*) from feed_items where true',
    'select count(*) from ../secrets',
    42,
  ]) {
    assert.equal(parseRestoreValidationTable(invalid), null);
  }
});

test('compiles a fail-closed restore drill contract', () => {
  const contract = {
    backupIncludes: ['feed_items', 'outbox_events'],
    operationalStateTables: ['outbox_events'],
    restoreValidationQueries: [
      'select count(*) from feed_items',
      'select count(*) from outbox_events',
    ],
  };
  assert.deepEqual(compileBackupRestoreDrillContract(contract), {
    backupIncludes: ['feed_items', 'outbox_events'],
    operationalStateTables: ['outbox_events'],
    restoreValidationTables: ['feed_items', 'outbox_events'],
  });
  for (const invalid of [
    { ...contract, backupIncludes: ['feed_items', 'feed_items'] },
    { ...contract, backupIncludes: ['../unsafe'] },
    { ...contract, restoreValidationQueries: ['select count(*) from unknown_table'] },
    { ...contract, restoreValidationQueries: ['select count(*) from feed_items;'] },
    { ...contract, restoreValidationQueries: ['select count(*) from feed_items'] },
  ]) {
    assert.throws(() => compileBackupRestoreDrillContract(invalid));
  }
});

test('accepts only one non-negative integer count result', () => {
  assert.equal(parseNonNegativeCount('0\n'), '0');
  assert.equal(parseNonNegativeCount('42'), '42');
  for (const invalid of ['', '-1', '1.5', '1\n2', 'NaN']) {
    assert.throws(() => parseNonNegativeCount(invalid));
  }
});

test('reports missing and unexpected restored tables deterministically', () => {
  assert.deepEqual(
    compareTableCoverage(
      ['_prisma_migrations', 'feed_items', 'reader_summary_artifacts'],
      ['reader_summary_artifacts', '_prisma_migrations', 'unexpected_table'],
    ),
    {
      missing: ['feed_items'],
      unexpected: ['unexpected_table'],
    },
  );
});

test('fingerprints backup membership and validation order independently', () => {
  const base = restoreDrillContractFingerprints({
    backupIncludes: ['feed_items', 'outbox_events'],
    restoreValidationTables: ['feed_items', 'outbox_events'],
  });
  const reorderedBackup = restoreDrillContractFingerprints({
    backupIncludes: ['outbox_events', 'feed_items'],
    restoreValidationTables: ['feed_items', 'outbox_events'],
  });
  const reorderedValidation = restoreDrillContractFingerprints({
    backupIncludes: ['feed_items', 'outbox_events'],
    restoreValidationTables: ['outbox_events', 'feed_items'],
  });
  assert.equal(base.backupIncludesHash, reorderedBackup.backupIncludesHash);
  assert.equal(
    base.restoreValidationContractHash,
    reorderedBackup.restoreValidationContractHash,
  );
  assert.notEqual(
    base.restoreValidationContractHash,
    reorderedValidation.restoreValidationContractHash,
  );
});

test('reader value assessment operational state is backed up and restore-validated', () => {
  const contract = JSON.parse(readFileSync(
    new URL('../../ops/recovery/backup-restore-contract.json', import.meta.url),
    'utf8',
  ));
  const table = 'reader_value_assessments';
  const query = `select count(*) from ${table}`;

  assert.ok(contract.backupIncludes.includes(table));
  assert.ok(contract.operationalStateTables.includes(table));
  assert.ok(contract.restoreValidationQueries.includes(query));
  const compiled = compileBackupRestoreDrillContract(contract);
  assert.ok(compiled.restoreValidationTables.includes(table));

  assert.throws(
    () => compileBackupRestoreDrillContract({
      ...contract,
      backupIncludes: contract.backupIncludes.filter((item) => item !== table),
    }),
    /restore validation table is not backed up: reader_value_assessments/,
  );
  assert.throws(
    () => compileBackupRestoreDrillContract({
      ...contract,
      restoreValidationQueries: contract.restoreValidationQueries.filter((item) => item !== query),
    }),
    /operational table has no restore validation query: reader_value_assessments/,
  );
});

test('tracked fixture-only postgres restore artifact matches current exact backup contract', () => {
  const contract = JSON.parse(readFileSync(
    new URL('../../ops/recovery/backup-restore-contract.json', import.meta.url), 'utf8',
  ));
  const compiled = compileBackupRestoreDrillContract(contract);
  const examples = JSON.parse(readFileSync(
    new URL('../../ops/drills/fixtures/staging-reliability-artifact-examples.json', import.meta.url), 'utf8',
  ));
  const artifact = examples.examples.find((item) => item.artifactId === 'postgres-restore-drill-output');
  assert.equal(artifact.provenance.fixtureOnly, true);
  assert.deepEqual(validatePostgresRestoreEvidence(artifact, compiled), []);

  const stale = JSON.parse(JSON.stringify(artifact));
  stale.signalResults.find((item) => item.signalId === 'postgres-backup-created')
    .evidence.expectedBackupIncludeCount -= 1;
  assert.ok(validatePostgresRestoreEvidence(stale, compiled)
    .includes('expected backup count must be 83'));
});
