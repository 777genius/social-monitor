import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cleanupPostgresDrillResources,
  executeRestoreValidationCounts,
  finalizePostgresCleanupEvidence,
  proveRestoredTableCoverage,
} from './postgres-restore-drill-runtime.mjs';

const contract = {
  backupIncludes: ['feed_items', 'outbox_events'],
  operationalStateTables: ['outbox_events'],
};

test('proves exact source and contract table coverage', () => {
  const proof = proveRestoredTableCoverage(
    ['outbox_events', 'feed_items', '_prisma_migrations'],
    ['_prisma_migrations', 'feed_items', 'outbox_events'],
    contract,
  );
  assert.equal(proof.backupIncludesMatched, true);
  assert.equal(proof.operationalTablesIncluded, true);
  assert.equal(proof.verifiedBackupIncludeCount, 2);
  assert.equal(proof.sourceTableNamesHash, proof.restoredTableNamesHash);

  assert.throws(
    () => proveRestoredTableCoverage(
      ['feed_items', 'outbox_events'],
      ['feed_items', 'unexpected_table'],
      contract,
    ),
    (error) => error.message.includes('"missingFromRestore":["outbox_events"]')
      && error.message.includes('"unexpectedAfterRestore":["unexpected_table"]')
      && error.message.includes('"missingContractTables":["outbox_events"]'),
  );
});

test('cleanup attempts both resources and preserves the first error', () => {
  const calls = [];
  const dropError = new Error('drop failed');
  const executor = (_command, argv) => {
    calls.push(argv);
    if (argv.includes('dropdb')) {
      throw dropError;
    }
    throw new Error('rm failed');
  };

  assert.throws(
    () => cleanupPostgresDrillResources('postgres-id', 'restore_db', '/tmp/backup.dump', executor),
    (error) => error === dropError,
  );
  assert.equal(calls.length, 2);
  assert.ok(calls[0].includes('dropdb'));
  assert.ok(calls[1].includes('rm'));
});

test('validation uses read-only psql with bounded execution', () => {
  const calls = [];
  const executor = (command, argv, options) => {
    calls.push({ command, argv, options });
    return '42\n';
  };
  assert.deepEqual(
    executeRestoreValidationCounts('postgres-id', 'restore_db', ['feed_items'], executor),
    { restore_count_01: '42' },
  );
  const [call] = calls;
  assert.equal(call.command, 'docker');
  assert.ok(call.argv.includes('--no-psqlrc'));
  assert.ok(call.argv.includes(
    'PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=10000',
  ));
  assert.equal(call.options.timeout, 15_000);
  assert.equal(call.options.input, 'select count(*)::text from public.feed_items;');
});

test('validation rejects output that is not one count', () => {
  assert.throws(
    () => executeRestoreValidationCounts(
      'postgres-id',
      'restore_db',
      ['feed_items'],
      () => '1\n2\n',
    ),
    /one non-negative integer/,
  );
});

test('validation rejects unsafe tables before invoking psql', () => {
  let invoked = false;
  assert.throws(
    () => executeRestoreValidationCounts(
      'postgres-id',
      'restore_db',
      ['feed_items; select secret from api_keys'],
      () => {
        invoked = true;
        return '0';
      },
    ),
    /restore validation table is unsafe/,
  );
  assert.equal(invoked, false);
});

test('cleanup evidence is finalized only after cleanup completes', () => {
  const artifact = {
    completedAt: 'before-cleanup',
    signalResults: [{
      signalId: 'postgres-backup-created',
      observedAt: 'before-cleanup',
      evidence: {},
    }],
  };
  assert.equal(
    finalizePostgresCleanupEvidence(artifact, 'after-cleanup'),
    artifact,
  );
  assert.equal(artifact.completedAt, 'after-cleanup');
  assert.equal(artifact.signalResults[0].observedAt, 'after-cleanup');
  assert.equal(artifact.signalResults[0].evidence.backupArtifactCleanedUp, true);
  assert.throws(() => finalizePostgresCleanupEvidence({}, 'after-cleanup'));
});
