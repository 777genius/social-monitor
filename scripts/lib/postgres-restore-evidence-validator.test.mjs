import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePostgresRestoreEvidence } from './postgres-restore-evidence-validator.mjs';

const contract = {
  backupIncludes: ['feed_items', 'outbox_events'],
  restoreValidationTables: ['feed_items', 'outbox_events'],
};

function artifact() {
  return {
    signalResults: [
      {
        signalId: 'postgres-backup-created',
        evidence: {
          includedTableCount: 2,
          sourceTableCount: 3,
          restoredTableCount: 3,
          operationalTablesIncluded: true,
          backupIncludesMatched: true,
          expectedBackupIncludeCount: 2,
          verifiedBackupIncludeCount: 2,
          missingBackupIncludeCount: 0,
          backupIncludesHash: '9af500431e615e42223eabc5cff4b698c75021c77b9e9a1c01995fc017db9cd6',
          sourceTableNamesHash: 'same-hash',
          restoredTableNamesHash: 'same-hash',
          backupArtifactCleanedUp: true,
        },
      },
      {
        signalId: 'postgres-validation-queries',
        evidence: {
          queryNames: ['restore_count_01', 'restore_count_02'],
          executedQueryCount: 2,
          failedQueryCount: 0,
          restoreValidationContractHash:
            '9af500431e615e42223eabc5cff4b698c75021c77b9e9a1c01995fc017db9cd6',
          queryResultsHash: 'query-hash',
        },
      },
    ],
  };
}

test('accepts exact contract-driven Postgres restore evidence', () => {
  assert.deepEqual(validatePostgresRestoreEvidence(artifact(), contract), []);
});

test('rejects count, hash, query-order and cleanup mutations', () => {
  const mutations = [
    (value) => { value.signalResults[0].evidence.verifiedBackupIncludeCount = 1; },
    (value) => { value.signalResults[0].evidence.backupIncludesHash = 'different'; },
    (value) => { value.signalResults[0].evidence.restoredTableNamesHash = 'different'; },
    (value) => { value.signalResults[0].evidence.backupArtifactCleanedUp = false; },
    (value) => { value.signalResults[1].evidence.queryNames.reverse(); },
    (value) => { value.signalResults[1].evidence.restoreValidationContractHash = 'different'; },
    (value) => { value.signalResults[1].evidence.executedQueryCount = 1; },
    (value) => { value.signalResults[1].evidence.failedQueryCount = 1; },
  ];
  for (const mutate of mutations) {
    const value = artifact();
    mutate(value);
    assert.notDeepEqual(validatePostgresRestoreEvidence(value, contract), []);
  }
});
