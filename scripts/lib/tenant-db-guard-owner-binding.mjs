export const migrationBindsTableOwner = ({ sql, table, ownerRole }) => {
  const normalizedTable = table.toLowerCase();
  const normalizedOwner = ownerRole.toLowerCase();
  const creations = [];
  const ownerAlterations = [];

  const validSql = walkSqlStatements(sql, ({ statement, activeRole }) => {
    const creation = parseTableCreation(statement);
    if (creation?.table === normalizedTable) {
      creations.push({
        index: creation.index,
        role: activeRole,
      });
    }
    const alteration = parseOwnerAlteration(statement);
    if (alteration?.table === normalizedTable) ownerAlterations.push(alteration);
    return true;
  });
  if (!validSql) return false;

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

export const migrationAuthorizesForwardRlsOperations = ({
  sql,
  table,
  requiredRole,
}) => {
  const normalizedTable = table.toLowerCase();
  const normalizedRole = requiredRole.toLowerCase();
  let relevantOperations = 0;

  const validSql = walkSqlStatements(sql, ({ statement, activeRole }) => {
    const operation = parseForwardRlsOperation(statement);
    if (operation?.invalid) return false;
    if (operation?.table !== normalizedTable) return true;
    relevantOperations += 1;
    return activeRole === normalizedRole;
  });

  return validSql && relevantOperations > 0;
};

const walkSqlStatements = (sql, visit) => {
  const scanned = scanSql(sql);
  if (scanned === null) return false;

  let sessionRole = null;
  let localRole = null;
  let transactionSessionRole = null;
  let savepoints = [];
  for (const statement of splitStatements(scanned)) {
    const command = wordAt(statement, 0);
    if (command === "call" || command === "execute") return false;

    if (containsUnsafeAuthorizationConfig(statement)) return false;

    const transactionControl = parseTransactionControl(statement);
    if (transactionControl?.invalid) return false;
    if (transactionControl?.type === "begin") {
      transactionSessionRole = sessionRole;
      localRole = null;
      savepoints = [];
    }
    if (transactionControl?.type === "savepoint") {
      savepoints.push({
        name: transactionControl.name,
        sessionRole,
        localRole,
      });
    }
    if (transactionControl?.type === "rollback-to") {
      const savepointIndex = savepoints.findLastIndex(
        ({ name }) => name === transactionControl.name,
      );
      if (savepointIndex < 0) return false;
      ({ sessionRole, localRole } = savepoints[savepointIndex]);
      savepoints = savepoints.slice(0, savepointIndex + 1);
    }
    if (transactionControl?.type === "release") {
      const savepointIndex = savepoints.findLastIndex(
        ({ name }) => name === transactionControl.name,
      );
      if (savepointIndex < 0) return false;
      savepoints = savepoints.slice(0, savepointIndex);
    }

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

    if (transactionControl?.type === "commit") {
      localRole = null;
      savepoints = [];
      transactionSessionRole = sessionRole;
    }
    if (transactionControl?.type === "rollback") {
      sessionRole = transactionSessionRole;
      localRole = null;
      savepoints = [];
    }

    if (!visit({ statement, activeRole: localRole ?? sessionRole })) return false;
  }
  return true;
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
      if (prefixedString === null) return null;
      tokens.push(prefixedString);
      index = prefixedString.end;
      continue;
    }
    if (character === "'") {
      const end = scanQuoted(sql, index, "'", true);
      if (end < 0) return null;
      tokens.push({
        kind: "string",
        value: sql.slice(index + 1, end - 1).replaceAll("''", "'"),
        certain: true,
        start: index,
        end,
      });
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
      const tokenEnd = end + delimiter.length;
      tokens.push({
        kind: "dollar-string",
        value: sql.slice(index + delimiter.length, end),
        start: index,
        end: tokenEnd,
      });
      index = tokenEnd;
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
    const end = scanEscapeString(sql, start + 1);
    if (end < 0) return null;
    const contents = sql.slice(start + 2, end - 1);
    return {
      kind: "string",
      value: contents.replaceAll("''", "'"),
      certain: !contents.includes("\\"),
      start,
      end,
    };
  }
  if (sql[start + 1] === "'" && (prefix === "b" || prefix === "x")) {
    const end = scanRestrictedString(sql, start + 1, prefix);
    if (end < 0) return null;
    return { kind: "string", value: null, certain: false, start, end };
  }
  if (prefix === "u" && sql[start + 1] === "&") {
    if (sql[start + 2] === "'") {
      const end = scanUnicodeString(sql, start + 2);
      if (end < 0) return null;
      const contents = sql.slice(start + 3, end - 1);
      return {
        kind: "string",
        value: contents.replaceAll("''", "'"),
        certain: !contents.includes("\\"),
        start,
        end,
      };
    }
    if (sql[start + 2] === '"') return null;
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

const scanQuoted = (sql, start, quote, rejectAmbiguousBackslash = false) => {
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] !== quote) {
      index += 1;
    } else if (sql[index + 1] === quote) {
      index += 2;
    } else {
      if (rejectAmbiguousBackslash) {
        let backslashStart = index;
        while (sql[backslashStart - 1] === "\\") backslashStart -= 1;
        if ((index - backslashStart) % 2 === 1) return -1;
      }
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

const containsUnsafeAuthorizationConfig = (statement) => {
  if (containsUnsafeAuthorizationConfigTokens(statement)) return true;
  if (!["do", "call"].includes(wordAt(statement, 0))) return false;

  for (const token of statement) {
    if (token.kind !== "dollar-string") continue;
    const bodyTokens = scanSql(token.value);
    if (bodyTokens === null || containsUnsafeAuthorizationConfigTokens(bodyTokens)) {
      return true;
    }
  }
  return false;
};

const containsUnsafeAuthorizationConfigTokens = (tokens) => {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if ((token.kind !== "word" && token.kind !== "identifier") ||
      token.value.toLowerCase() !== "set_config" ||
      tokens[index + 1]?.value !== "(") {
      continue;
    }

    const firstArgument = [];
    let depth = 1;
    let cursor = index + 2;
    for (; cursor < tokens.length; cursor += 1) {
      const value = tokens[cursor].value;
      if (value === "(") depth += 1;
      if (value === ")") depth -= 1;
      if ((value === "," && depth === 1) || depth === 0) break;
      firstArgument.push(tokens[cursor]);
    }
    if (tokens[cursor]?.value !== ",") return true;
    if (!isProvenUnrelatedConfigName(firstArgument)) return true;
  }
  return false;
};

const isProvenUnrelatedConfigName = (tokens) => {
  while (tokens[0]?.value === "(" && tokens.at(-1)?.value === ")" &&
    enclosesEntireExpression(tokens)) {
    tokens = tokens.slice(1, -1);
  }
  const literal = tokens[0];
  if (literal?.kind !== "string" || literal.certain !== true) return false;
  const configName = literal.value.toLowerCase();
  if (configName === "role" || configName === "session_authorization") {
    return false;
  }
  if (tokens.length === 1) return true;
  return tokens[1]?.value === ":" && tokens[2]?.value === ":" &&
    tokens.slice(3).every(({ kind, value }) =>
      kind === "word" || kind === "identifier" || value === "."
    );
};

const enclosesEntireExpression = (tokens) => {
  let depth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].value === "(") depth += 1;
    if (tokens[index].value === ")") depth -= 1;
    if (depth === 0 && index < tokens.length - 1) return false;
  }
  return depth === 0;
};

const parseTransactionControl = (statement) => {
  const firstWord = wordAt(statement, 0);
  if (firstWord === "begin" ||
    (firstWord === "start" && wordAt(statement, 1) === "transaction")) {
    return { type: "begin" };
  }
  if (firstWord === "commit" || firstWord === "end") return { type: "commit" };
  if (firstWord === "savepoint") {
    const name = savepointNameAt(statement, 1);
    return name !== null && endsAt(statement, 2)
      ? { type: "savepoint", name }
      : { invalid: true };
  }
  if (firstWord === "release") {
    let cursor = 1;
    if (wordAt(statement, cursor) === "savepoint") cursor += 1;
    const name = savepointNameAt(statement, cursor);
    return name !== null && endsAt(statement, cursor + 1)
      ? { type: "release", name }
      : { invalid: true };
  }
  if (firstWord !== "rollback" && firstWord !== "abort") return null;

  let cursor = 1;
  if (["work", "transaction"].includes(wordAt(statement, cursor))) cursor += 1;
  if (wordAt(statement, cursor) !== "to") return { type: "rollback" };
  cursor += 1;
  if (wordAt(statement, cursor) === "savepoint") cursor += 1;
  const name = savepointNameAt(statement, cursor);
  return name !== null && endsAt(statement, cursor + 1)
    ? { type: "rollback-to", name }
    : { invalid: true };
};

const savepointNameAt = (tokens, index) => {
  const token = tokens[index];
  if (token?.kind === "word") return token.value;
  if (token?.kind === "identifier" && token.value.length > 0) return token.value;
  return null;
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

const parseForwardRlsOperation = (statement) => {
  if (startsWithWords(statement, ["alter", "table"])) {
    const alteration = parseTableAlteration(statement);
    if (alteration === null || endsAt(statement, alteration.relation.next)) {
      return { invalid: true };
    }
    return alteration;
  }
  if (!["create", "drop", "alter"].includes(wordAt(statement, 0)) ||
    wordAt(statement, 1) !== "policy") {
    return null;
  }

  let cursor = 2;
  if (wordAt(statement, 0) === "drop" &&
    wordAt(statement, cursor) === "if" &&
    wordAt(statement, cursor + 1) === "exists") {
    cursor += 2;
  }
  if (identifierAt(statement, cursor) === null ||
    wordAt(statement, cursor + 1) !== "on") {
    return { invalid: true };
  }
  const relation = relationAt(statement, cursor + 2);
  if (relation === null ||
    (wordAt(statement, 0) === "alter" && endsAt(statement, relation.next))) {
    return { invalid: true };
  }
  return { table: relation.table };
};

const parseTableAlteration = (statement) => {
  if (!startsWithWords(statement, ["alter", "table"])) return null;
  let cursor = 2;
  if (wordAt(statement, cursor) === "if" &&
    wordAt(statement, cursor + 1) === "exists") {
    cursor += 2;
  }
  if (wordAt(statement, cursor) === "only") cursor += 1;
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
