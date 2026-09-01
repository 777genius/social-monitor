const roleStatementPattern =
  /\b(?:(SET\s+LOCAL\s+ROLE)\s+"?([a-z_][a-z0-9_]*)"?|(RESET\s+ROLE))\s*;/giu;

export const migrationBindsTableOwner = ({ sql, table, ownerRole }) => {
  const escapedTable = escapeRegex(table);
  const createPattern = new RegExp(
    `\\bCREATE\\s+TABLE\\s+(?:public\\.)?"?${escapedTable}"?\\s*\\(`,
    "giu",
  );
  const creations = [...sql.matchAll(createPattern)];
  if (creations.length > 1) return false;
  const alterOwnerPattern = new RegExp(
    `\\bALTER\\s+TABLE\\s+(?:ONLY\\s+)?(?:public\\.)?"?${escapedTable}"?` +
      `\\s+OWNER\\s+TO\\s+"?([a-z_][a-z0-9_]*)"?\\s*;`,
    "giu",
  );
  const ownerAlterations = [...sql.matchAll(alterOwnerPattern)];
  const tableOperationPattern = new RegExp(
    `\\bALTER\\s+TABLE\\s+(?:ONLY\\s+)?(?:public\\.)?"?${escapedTable}"?\\b`,
    "iu",
  );
  const operationIndex = creations[0]?.index ??
    sql.search(tableOperationPattern);
  if (operationIndex < 0) return false;
  const finalOwnerAlteration = ownerAlterations
    .filter((match) => (match.index ?? -1) >= operationIndex)
    .at(-1);
  if (finalOwnerAlteration !== undefined) {
    return finalOwnerAlteration[1]?.toLowerCase() === ownerRole.toLowerCase();
  }
  const precedingRoleStatements = [
    ...sql.slice(0, operationIndex).matchAll(roleStatementPattern),
  ];
  const activeRole = precedingRoleStatements.at(-1);
  const operationRunsAsOwner = activeRole?.[1] !== undefined &&
    activeRole[2]?.toLowerCase() === ownerRole.toLowerCase();
  return operationRunsAsOwner;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
