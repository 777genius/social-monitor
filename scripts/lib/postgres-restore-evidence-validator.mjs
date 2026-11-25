import {
  restoreDrillContractFingerprints,
  restoreValidationQueryIds,
} from './backup-restore-drill-contract.mjs';

export function validatePostgresRestoreEvidence(artifact, contract) {
  const violations = [];
  const fingerprints = restoreDrillContractFingerprints(contract);
  const results = new Map();
  for (const result of artifact?.signalResults ?? []) {
    if (results.has(result?.signalId)) {
      violations.push(`duplicate Postgres signal result: ${result.signalId}`);
    }
    results.set(result?.signalId, result?.evidence);
  }

  const backup = results.get('postgres-backup-created');
  const validation = results.get('postgres-validation-queries');
  if (!isRecord(backup)) {
    violations.push('postgres-backup-created evidence is missing');
  } else {
    const expectedCount = contract.backupIncludes.length;
    requireEqual(violations, backup.expectedBackupIncludeCount, expectedCount, 'expected backup count');
    requireEqual(violations, backup.verifiedBackupIncludeCount, expectedCount, 'verified backup count');
    requireEqual(violations, backup.includedTableCount, expectedCount, 'included table count');
    requireEqual(violations, backup.missingBackupIncludeCount, 0, 'missing backup count');
    requireEqual(
      violations,
      backup.backupIncludesHash,
      fingerprints.backupIncludesHash,
      'backup contract hash',
    );
    requireEqual(violations, backup.backupIncludesMatched, true, 'backup include match');
    requireEqual(violations, backup.operationalTablesIncluded, true, 'operational table coverage');
    requireEqual(violations, backup.backupArtifactCleanedUp, true, 'backup cleanup');
    if (!Number.isInteger(backup.sourceTableCount) || backup.sourceTableCount < expectedCount) {
      violations.push('source table count is below the backup contract count');
    }
    requireEqual(violations, backup.restoredTableCount, backup.sourceTableCount, 'source/restored table count');
    if (!nonEmptyString(backup.sourceTableNamesHash)) {
      violations.push('source table-name hash is missing');
    }
    requireEqual(
      violations,
      backup.restoredTableNamesHash,
      backup.sourceTableNamesHash,
      'source/restored table-name hash',
    );
  }

  if (!isRecord(validation)) {
    violations.push('postgres-validation-queries evidence is missing');
  } else {
    const expectedNames = restoreValidationQueryIds(contract.restoreValidationTables);
    requireEqual(
      violations,
      validation.restoreValidationContractHash,
      fingerprints.restoreValidationContractHash,
      'restore validation contract hash',
    );
    if (JSON.stringify(validation.queryNames) !== JSON.stringify(expectedNames)) {
      violations.push('validation query names do not exactly match the reviewed contract order');
    }
    requireEqual(violations, validation.executedQueryCount, expectedNames.length, 'executed query count');
    requireEqual(violations, validation.failedQueryCount, 0, 'failed query count');
    if (!nonEmptyString(validation.queryResultsHash)) {
      violations.push('validation query results hash is missing');
    }
  }

  return violations;
}

function requireEqual(violations, actual, expected, label) {
  if (actual !== expected) {
    violations.push(`${label} must be ${JSON.stringify(expected)}`);
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
