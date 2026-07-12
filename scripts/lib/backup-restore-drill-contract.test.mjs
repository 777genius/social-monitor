import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compileBackupRestoreDrillContract,
  compareTableCoverage,
  parseNonNegativeCount,
  parseRestoreValidationTable,
  restoreDrillContractFingerprints,
} from './backup-restore-drill-contract.mjs';

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
