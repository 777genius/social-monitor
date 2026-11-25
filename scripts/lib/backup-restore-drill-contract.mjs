import { createHash } from 'node:crypto';

const COUNT_QUERY_PATTERN = /^select count\(\*\) from ([a-z][a-z0-9_]*)$/;
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;

export function parseRestoreValidationTable(query) {
  if (typeof query !== 'string') {
    return null;
  }
  const table = query.match(COUNT_QUERY_PATTERN)?.[1];
  return table !== undefined && query === `select count(*) from ${table}` ? table : null;
}

export function compareTableCoverage(expectedTables, actualTables) {
  const expected = new Set(expectedTables);
  const actual = new Set(actualTables);
  return {
    missing: [...expected].filter((table) => !actual.has(table)).sort(),
    unexpected: [...actual].filter((table) => !expected.has(table)).sort(),
  };
}

export function compileBackupRestoreDrillContract(contract) {
  if (typeof contract !== 'object' || contract === null || Array.isArray(contract)) {
    throw new Error('backup restore contract must be an object');
  }
  const backupIncludes = uniqueIdentifiers(contract.backupIncludes, 'backupIncludes');
  const operationalStateTables = uniqueIdentifiers(
    contract.operationalStateTables,
    'operationalStateTables',
  );
  if (!Array.isArray(contract.restoreValidationQueries) || contract.restoreValidationQueries.length === 0) {
    throw new Error('restoreValidationQueries must be a non-empty array');
  }
  const backupSet = new Set(backupIncludes);
  const restoreValidationTables = [];
  const validationSet = new Set();
  for (const query of contract.restoreValidationQueries) {
    const table = parseRestoreValidationTable(query);
    if (table === null) {
      throw new Error('restore validation query is not canonical');
    }
    if (!backupSet.has(table)) {
      throw new Error(`restore validation table is not backed up: ${table}`);
    }
    if (validationSet.has(table)) {
      throw new Error(`duplicate restore validation table: ${table}`);
    }
    validationSet.add(table);
    restoreValidationTables.push(table);
  }
  for (const table of operationalStateTables) {
    if (!validationSet.has(table)) {
      throw new Error(`operational table has no restore validation query: ${table}`);
    }
  }
  return { backupIncludes, operationalStateTables, restoreValidationTables };
}

export function parseNonNegativeCount(output) {
  const value = String(output).trim();
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error('restore validation query did not return one non-negative integer');
  }
  return value;
}

export function restoreValidationQueryIds(tables) {
  return tables.map((_, index) => `restore_count_${String(index + 1).padStart(2, '0')}`);
}

export function restoreDrillContractFingerprints(contract) {
  return {
    backupIncludesHash: hashJson([...contract.backupIncludes].sort()),
    restoreValidationContractHash: hashJson(contract.restoreValidationTables),
  };
}

export function assertSafeIdentifier(identifier, field = 'identifier') {
  if (typeof identifier !== 'string' || !IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`${field} is unsafe`);
  }
  return identifier;
}

function uniqueIdentifiers(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must be a non-empty array`);
  }
  const seen = new Set();
  for (const identifier of value) {
    assertSafeIdentifier(identifier, `${field} entry`);
    if (seen.has(identifier)) {
      throw new Error(`${field} contains a duplicate identifier: ${identifier}`);
    }
    seen.add(identifier);
  }
  return [...value];
}

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
