const roleStatementPattern =
  /\b(?:(SET\s+(?:(?:LOCAL|SESSION)\s+)?ROLE)\s+(?:"([a-z_][a-z0-9_]*)"|([a-z_][a-z0-9_]*))|(RESET\s+ROLE))\s*;/giu;
const possibleRoleStatementPattern =
  /\b(?:SET\s+(?:(?:LOCAL|SESSION)\s+)?ROLE|RESET\s+ROLE|SET\s+SESSION\s+AUTHORIZATION|RESET\s+SESSION\s+AUTHORIZATION)\b/giu;

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
  const precedingSql = sql.slice(0, operationIndex);
  const precedingRoleStatements = [...precedingSql.matchAll(
    roleStatementPattern,
  )];
  const recognizedRoleStatementIndexes = new Set(
    precedingRoleStatements.map((match) => match.index),
  );
  const hasUnrecognizedRoleStatement = [...precedingSql.matchAll(
    possibleRoleStatementPattern,
  )].some((match) => !recognizedRoleStatementIndexes.has(match.index));
  if (hasUnrecognizedRoleStatement) return false;
  const activeRole = precedingRoleStatements.at(-1);
  const operationRunsAsOwner = activeRole?.[1] !== undefined &&
    (activeRole[2] ?? activeRole[3])?.toLowerCase() ===
      ownerRole.toLowerCase();
  return operationRunsAsOwner;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
