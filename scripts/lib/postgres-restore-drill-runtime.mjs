import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import {
  assertSafeIdentifier,
  compareTableCoverage,
  parseNonNegativeCount,
  restoreValidationQueryIds,
} from './backup-restore-drill-contract.mjs';

export function readPostgresTableNames(psql, containerId, database) {
  return psql(containerId, database, `
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name;
  `).split('\n').map((value) => value.trim()).filter(Boolean);
}

export function proveRestoredTableCoverage(sourceTables, restoredTables, contract) {
  const sourceCoverage = compareTableCoverage(sourceTables, restoredTables);
  const contractCoverage = compareTableCoverage(contract.backupIncludes, restoredTables);
  if (
    sourceCoverage.missing.length > 0
    || sourceCoverage.unexpected.length > 0
    || contractCoverage.missing.length > 0
  ) {
    throw new Error(`restored PostgreSQL table coverage mismatch: ${JSON.stringify({
      missingFromRestore: sourceCoverage.missing,
      unexpectedAfterRestore: sourceCoverage.unexpected,
      missingContractTables: contractCoverage.missing,
    })}`);
  }
  const restoredSet = new Set(restoredTables);
  return {
    operationalTablesIncluded: contract.operationalStateTables.every(
      (table) => restoredSet.has(table),
    ),
    backupIncludesMatched: true,
    verifiedBackupIncludeCount: contract.backupIncludes.length,
    missingBackupIncludeCount: 0,
    sourceTableNamesHash: hashJson([...sourceTables].sort()),
    restoredTableNamesHash: hashJson([...restoredTables].sort()),
  };
}

export function executeRestoreValidationCounts(
  containerId,
  database,
  tables,
  executor = execFileSync,
) {
  const queryIds = restoreValidationQueryIds(tables);
  return Object.fromEntries(tables.map((table, index) => [
    queryIds[index],
    parseNonNegativeCount(validationPsqlCount(
      containerId,
      database,
      assertSafeIdentifier(table, 'restore validation table'),
      executor,
    )),
  ]));
}

export function finalizePostgresCleanupEvidence(artifact, completedAt) {
  const backupSignal = artifact?.signalResults?.find(
    (signal) => signal?.signalId === 'postgres-backup-created',
  );
  if (
    typeof artifact !== 'object'
    || artifact === null
    || typeof backupSignal?.evidence !== 'object'
    || backupSignal.evidence === null
  ) {
    throw new Error('Postgres cleanup evidence cannot be finalized');
  }
  artifact.completedAt = completedAt;
  backupSignal.observedAt = completedAt;
  backupSignal.evidence.backupArtifactCleanedUp = true;
  return artifact;
}

export function cleanupPostgresDrillResources(
  containerId,
  restoreDatabase,
  backupPath,
  executor = execFileSync,
) {
  let firstError;
  try {
    executor(
      'docker',
      ['exec', containerId, 'dropdb', '-U', 'social_monitor', '--if-exists', restoreDatabase],
      { stdio: 'ignore' },
    );
  } catch (error) {
    firstError = error;
  }
  try {
    executor('docker', ['exec', containerId, 'rm', '-f', backupPath], { stdio: 'ignore' });
  } catch (error) {
    firstError ??= error;
  }
  if (firstError !== undefined) {
    throw firstError;
  }
}

function validationPsqlCount(containerId, database, table, executor) {
  return executor(
    'docker',
    [
      'exec', '-i', '-e',
      'PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=10000',
      containerId,
      'psql', '--no-psqlrc', '-U', 'social_monitor', '-d', database,
      '-t', '-A', '-v', 'ON_ERROR_STOP=1',
    ],
    {
      encoding: 'utf8',
      input: `select count(*)::text from public.${table};`,
      timeout: 15_000,
    },
  ).trim();
}

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
