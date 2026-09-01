export const migrationBindsTableOwner = ({ sql, table, ownerRole }) => {
  const scanned = scanSql(sql);
  if (scanned === null) return false;

  const statements = splitStatements(scanned);
  const normalizedTable = table.toLowerCase();
  const normalizedOwner = ownerRole.toLowerCase();
  let sessionRole = null;
  let localRole = null;
  const creations = [];
  const ownerAlterations = [];

  for (const statement of statements) {
    const roleChange = parseRoleChange(statement);
    if (roleChange?.invalid) return false;
    if (roleChange?.scope === "local") localRole = roleChange.role;
    if (roleChange?.scope === "session") {
      sessionRole = roleChange.role;
      localRole = null;
    }
    if (roleChange?.scope === "reset") {
      sessionRole = null;
      localRole = null;
    }

    if (startsWithWords(statement, ["commit"]) ||
      startsWithWords(statement, ["rollback"])) {
      localRole = null;
    }

    const creation = parseTableCreation(statement);
    if (creation?.table === normalizedTable) {
      creations.push({
        index: creation.index,
        role: localRole ?? sessionRole,
      });
    }
    const alteration = parseOwnerAlteration(statement);
    if (alteration?.table === normalizedTable) ownerAlterations.push(alteration);
  }

  if (creations.length > 1) return false;
  const operation = creations[0] ?? ownerAlterations[0];
  const operationIndex = operation?.index;
  if (operationIndex === undefined) return false;
  const finalOwnerAlteration = ownerAlterations
    .filter(({ index }) => index >= operationIndex)
    .at(-1);
  if (finalOwnerAlteration !== undefined) {
    return finalOwnerAlteration.owner === normalizedOwner;
  }
  return operation?.role === normalizedOwner;
};

const scanSql = (sql) => {
  const tokens = [];
  let index = 0;
  while (index < sql.length) {
    const character = sql[index];
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    if (sql.startsWith("--", index)) {
      const newline = sql.indexOf("\n", index + 2);
      index = newline < 0 ? sql.length : newline + 1;
      continue;
    }
    if (sql.startsWith("/*", index)) {
      const end = scanBlockComment(sql, index);
      if (end < 0) return null;
      index = end;
      continue;
    }
    const prefixedString = scanPrefixedString(sql, index);
    if (prefixedString !== undefined) {
      if (prefixedString < 0) return null;
      index = prefixedString;
      continue;
    }
    if (character === "'") {
      const end = scanQuoted(sql, index, "'");
      if (end < 0) return null;
      index = end;
      continue;
    }
    if (character === '"') {
      const quoted = scanQuotedIdentifier(sql, index);
      if (quoted === null) return null;
      tokens.push(quoted);
      index = quoted.end;
      continue;
    }
    if (character === "$") {
      const delimiter = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u)?.[0];
      if (delimiter === undefined) return null;
      const end = sql.indexOf(delimiter, index + delimiter.length);
      if (end < 0) return null;
      index = end + delimiter.length;
      continue;
    }
    const word = sql.slice(index).match(/^[A-Za-z_][A-Za-z0-9_$]*/u)?.[0];
    if (word !== undefined) {
      if (word.toLowerCase() === "uescape") return null;
      tokens.push({ kind: "word", value: word.toLowerCase(), start: index, end: index + word.length });
      index += word.length;
      continue;
    }
    tokens.push({ kind: "symbol", value: character, start: index, end: index + 1 });
    index += 1;
  }
  return tokens;
};

const scanPrefixedString = (sql, start) => {
  const prefix = sql[start]?.toLowerCase();
  if (sql[start + 1] === "'" && prefix === "e") {
    return scanEscapeString(sql, start + 1);
  }
  if (sql[start + 1] === "'" && (prefix === "b" || prefix === "x")) {
    return scanRestrictedString(sql, start + 1, prefix);
  }
  if (prefix === "u" && sql[start + 1] === "&") {
    if (sql[start + 2] === "'") return scanUnicodeString(sql, start + 2);
    if (sql[start + 2] === '"') return -1;
  }
  return undefined;
};

const scanEscapeString = (sql, start) => {
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] === "\\") {
      if (index + 1 >= sql.length) return -1;
      index += 2;
    } else if (sql[index] !== "'") {
      index += 1;
    } else if (sql[index + 1] === "'") {
      index += 2;
    } else {
      return index + 1;
    }
  }
  return -1;
};

const scanRestrictedString = (sql, start, prefix) => {
  const end = scanQuoted(sql, start, "'");
  if (end < 0) return -1;
  const contents = sql.slice(start + 1, end - 1);
  const valid = prefix === "b"
    ? /^[01]*$/u.test(contents)
    : /^[0-9a-f]*$/iu.test(contents);
  return valid ? end : -1;
};

const scanUnicodeString = (sql, start) => {
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] === "\\") {
      const escape = sql.slice(index + 1);
      if (escape.startsWith("\\")) {
        index += 2;
      } else if (/^\+[0-9a-f]{6}/iu.test(escape)) {
        index += 8;
      } else if (/^[0-9a-f]{4}/iu.test(escape)) {
        index += 5;
      } else {
        return -1;
      }
    } else if (sql[index] !== "'") {
      index += 1;
    } else if (sql[index + 1] === "'") {
      index += 2;
    } else {
      return index + 1;
    }
  }
  return -1;
};

const scanBlockComment = (sql, start) => {
  let depth = 1;
  let index = start + 2;
  while (index < sql.length) {
    if (sql.startsWith("/*", index)) {
      depth += 1;
      index += 2;
    } else if (sql.startsWith("*/", index)) {
      depth -= 1;
      index += 2;
      if (depth === 0) return index;
    } else {
      index += 1;
    }
  }
  return -1;
};

const scanQuoted = (sql, start, quote) => {
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] !== quote) {
      index += 1;
    } else if (sql[index + 1] === quote) {
      index += 2;
    } else {
      return index + 1;
    }
  }
  return -1;
};

const scanQuotedIdentifier = (sql, start) => {
  let index = start + 1;
  let value = "";
  while (index < sql.length) {
    if (sql[index] !== '"') {
      value += sql[index];
      index += 1;
    } else if (sql[index + 1] === '"') {
      value += '"';
      index += 2;
    } else {
      return { kind: "identifier", value, start, end: index + 1 };
    }
  }
  return null;
};

const splitStatements = (tokens) => {
  const statements = [];
  let current = [];
  for (const token of tokens) {
    current.push(token);
    if (token.value === ";") {
      statements.push(current);
      current = [];
    }
  }
  if (current.length > 0) statements.push(current);
  return statements;
};

const parseRoleChange = (statement) => {
  if (wordAt(statement, 0) === "set") {
    if (startsWithWords(statement, ["set", "session", "authorization"])) {
      return { invalid: true };
    }
    let cursor = 1;
    let scope = "session";
    if (wordAt(statement, cursor) === "local") {
      scope = "local";
      cursor += 1;
    } else if (wordAt(statement, cursor) === "session") {
      cursor += 1;
    }
    if (wordAt(statement, cursor) === "session" &&
      wordAt(statement, cursor + 1) === "authorization") {
      return { invalid: true };
    }
    if (wordAt(statement, cursor) !== "role") return null;
    const role = identifierAt(statement, cursor + 1);
    if (role === null || !endsAt(statement, cursor + 2)) return { invalid: true };
    return { scope, role };
  }
  if (wordAt(statement, 0) === "reset") {
    if (wordAt(statement, 1) === "session" && wordAt(statement, 2) === "authorization") return { invalid: true };
    if (wordAt(statement, 1) !== "role") return null;
    return endsAt(statement, 2) ? { scope: "reset", role: null } : { invalid: true };
  }
  return null;
};

const parseTableCreation = (statement) => {
  if (!startsWithWords(statement, ["create", "table"])) return null;
  const relation = relationAt(statement, 2);
  if (relation === null || statement[relation.next]?.value !== "(") return null;
  return { table: relation.table, index: statement[0].start };
};

const parseOwnerAlteration = (statement) => {
  const tableAlteration = parseTableAlteration(statement);
  if (tableAlteration === null) return null;
  const relation = tableAlteration.relation;
  if (relation === null) return null;
  let cursor = relation.next;
  if (wordAt(statement, cursor) !== "owner" || wordAt(statement, cursor + 1) !== "to") return null;
  const owner = identifierAt(statement, cursor + 2);
  if (owner === null || !endsAt(statement, cursor + 3)) return null;
  return { table: relation.table, owner, index: tableAlteration.index };
};

const parseTableAlteration = (statement) => {
  if (!startsWithWords(statement, ["alter", "table"])) return null;
  const cursor = wordAt(statement, 2) === "only" ? 3 : 2;
  const relation = relationAt(statement, cursor);
  if (relation === null) return null;
  return { table: relation.table, index: statement[0].start, relation };
};

const relationAt = (statement, cursor) => {
  let table = identifierAt(statement, cursor);
  if (table === null) return null;
  if (statement[cursor + 1]?.value === ".") {
    if (table !== "public") return null;
    table = identifierAt(statement, cursor + 2);
    if (table === null) return null;
    return { table, next: cursor + 3 };
  }
  return { table, next: cursor + 1 };
};

const identifierAt = (tokens, index) => {
  const token = tokens[index];
  if (token?.kind !== "word" && token?.kind !== "identifier") return null;
  if (!/^[a-z_][a-z0-9_]*$/u.test(token.value)) return null;
  return token.value.toLowerCase();
};

const wordAt = (tokens, index) => tokens[index]?.kind === "word" ? tokens[index].value : null;
const startsWithWords = (tokens, words) => words.every((word, index) => wordAt(tokens, index) === word);
const endsAt = (tokens, index) => tokens.length === index ||
  (tokens.length === index + 1 && tokens[index]?.value === ";");
