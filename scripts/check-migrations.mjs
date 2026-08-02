import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, globSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

const immutableBaselinePath =
  'prisma/migrations/20260618143000_baseline/migration.sql';
const immutableBaselineSha256 =
  'ebc492b89ddd13604ada5ad0bf3c1967e0ea42f7d5799c639571199bee4b7f77';
const migrationDiffDirectory = mkdtempSync(join(tmpdir(), 'social-monitor-migration-diff-'));
const migrationDiffPath = join(migrationDiffDirectory, 'migration.sql');
process.on('exit', () => rmSync(migrationDiffDirectory, { recursive: true, force: true }));

const prismaCommandEnv = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ?? 'postgresql://social_monitor:social_monitor_local_password@localhost:5432/social_monitor',
};

const commands = [
  {
    label: 'prisma validate',
    args: ['prisma', 'validate', '--schema', 'prisma/schema.prisma'],
  },
  {
    label: 'prisma generate',
    args: ['prisma', 'generate', '--schema', 'prisma/schema.prisma'],
  },
  {
    label: 'prisma migrate diff from empty',
    args: [
      'prisma',
      'migrate',
      'diff',
      '--from-empty',
      '--to-schema',
      'prisma/schema.prisma',
      '--script',
      '--output',
      migrationDiffPath,
    ],
  },
];

let migrationSql = '';
const migrationFiles = globSync('prisma/migrations/*/migration.sql').sort();
const repairMigrationFiles = migrationFiles.filter((file) => file.includes('_repair_'));
const forwardMigrationFiles = migrationFiles.filter(
  (file) => file !== immutableBaselinePath && !repairMigrationFiles.includes(file),
);

for (const command of commands) {
  const result =
    process.platform === 'win32'
      ? spawnSync(`npx ${command.args.join(' ')}`, {
          encoding: 'utf8',
          env: prismaCommandEnv,
          shell: true,
          stdio: 'inherit',
        })
      : spawnSync('npx', command.args, {
          encoding: 'utf8',
          env: prismaCommandEnv,
          stdio: 'inherit',
        });

  if (result.status !== 0) {
    console.error(`${command.label} failed`);
    process.exit(result.status ?? 1);
  }
}

migrationSql = readFileSync(migrationDiffPath, 'utf8');

const violations = [];
const committedMigrationSqlByFile = migrationFiles.map((file) => readFileSync(file, 'utf8'));
const committedMigrationSql = committedMigrationSqlByFile.join('\n');
const createdTableNames = new Set(
  committedMigrationSqlByFile.flatMap((sql) => [...createdTables(sql)]),
);

if (!migrationSql.includes('CREATE TABLE')) {
  violations.push('clean migration diff must create tables from the current Prisma schema');
}

if (!existsSync('prisma/migrations')) {
  violations.push('prisma/migrations must exist; production uses committed Prisma migration history');
}

if (migrationFiles.length === 0) {
  violations.push('at least one committed Prisma migration.sql file is required');
}

if (!migrationFiles.includes(immutableBaselinePath)) {
  violations.push(`immutable baseline is missing: ${immutableBaselinePath}`);
} else if (sha256(readFileSync(immutableBaselinePath)) !== immutableBaselineSha256) {
  violations.push(
    `${immutableBaselinePath} is immutable and must retain SHA-256 ${immutableBaselineSha256}`,
  );
}

if (new Set(migrationFiles).size !== migrationFiles.length) {
  violations.push('migration paths must be unique and apply in lexical timestamp order');
}

for (const [label, sql] of [
  ['clean migration diff', migrationSql],
  ['committed migration history', committedMigrationSql],
]) {
  for (const destructive of ['DROP TABLE', 'DROP SCHEMA', 'TRUNCATE TABLE']) {
    if (sql.includes(destructive)) {
      violations.push(`${label} must not contain destructive statement: ${destructive}`);
    }
  }
}

for (const tableName of mappedTables()) {
  if (!createdTableNames.has(tableName)) {
    violations.push(`committed migration history must create mapped Prisma table "${tableName}"`);
  }
}

for (const file of forwardMigrationFiles) {
  const sql = readFileSync(file, 'utf8');
  if (!sql.includes('@social-monitor-forward-migration')) {
    violations.push(`${file} must include @social-monitor-forward-migration marker`);
  }
  if (sql.includes('reader_summary.legacy_publication_proof.v1')) {
    const canonicalMigrationName = basename(dirname(file));
    if (!sql.includes(`'migration', '${canonicalMigrationName}'`)) {
      violations.push(
        `${file} legacy publication proof must use canonical Prisma migration name ${canonicalMigrationName}`,
      );
    }
  }
}

for (const file of repairMigrationFiles) {
  const sql = readFileSync(file, 'utf8');
  if (!sql.includes('@social-monitor-repair-migration')) {
    violations.push(`${file} must include @social-monitor-repair-migration marker`);
  }
  if (/CREATE\s+TABLE(?!\s+IF\s+NOT\s+EXISTS)/i.test(sql)) {
    violations.push(`${file} repair migration CREATE TABLE statements must use IF NOT EXISTS`);
  }
  if (/CREATE\s+(?:UNIQUE\s+)?INDEX(?!\s+IF\s+NOT\s+EXISTS)/i.test(sql)) {
    violations.push(`${file} repair migration CREATE INDEX statements must use IF NOT EXISTS`);
  }
  if (/ALTER\s+TABLE[\s\S]*?\sADD\s+COLUMN(?!\s+IF\s+NOT\s+EXISTS)/i.test(sql)) {
    violations.push(`${file} repair migration ADD COLUMN statements must use IF NOT EXISTS`);
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Migration schema checks OK');

function mappedTables() {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  return [...schema.matchAll(/@@map\("([^"]+)"\)/g)].map((match) => match[1]).sort();
}

function createdTables(sql) {
  const tokens = sqlTokens(sql);
  const names = new Set();
  let statementStart = 0;

  while (statementStart < tokens.length) {
    while (tokens[statementStart]?.value === ';') {
      statementStart += 1;
    }

    const tableName = createdTableAt(tokens, statementStart);
    if (tableName !== undefined) {
      names.add(tableName);
    }

    while (statementStart < tokens.length && tokens[statementStart].value !== ';') {
      statementStart += 1;
    }
  }

  return names;
}

function createdTableAt(tokens, statementStart) {
  let cursor = statementStart;
  if (!isKeyword(tokens[cursor], 'CREATE') || !isKeyword(tokens[cursor + 1], 'TABLE')) {
    return undefined;
  }
  cursor += 2;

  if (
    isKeyword(tokens[cursor], 'IF') &&
    isKeyword(tokens[cursor + 1], 'NOT') &&
    isKeyword(tokens[cursor + 2], 'EXISTS')
  ) {
    cursor += 3;
  }

  if (isPublicIdentifier(tokens[cursor]) && tokens[cursor + 1]?.value === '.') {
    cursor += 2;
  }

  const table = tokens[cursor];
  if (table?.type !== 'quotedIdentifier' || tokens[cursor + 1]?.value !== '(') {
    return undefined;
  }
  return table.value;
}

function isKeyword(token, keyword) {
  return token?.type === 'word' && token.value.toUpperCase() === keyword;
}

function isPublicIdentifier(token) {
  return (
    (token?.type === 'word' && token.value.toLowerCase() === 'public') ||
    (token?.type === 'quotedIdentifier' && token.value === 'public')
  );
}

function sqlTokens(sql) {
  const tokens = [];
  let cursor = 0;

  while (cursor < sql.length) {
    const character = sql[cursor];

    if (/\s/.test(character)) {
      cursor += 1;
      continue;
    }
    if (sql.startsWith('--', cursor)) {
      cursor = skipLineComment(sql, cursor + 2);
      continue;
    }
    if (sql.startsWith('/*', cursor)) {
      cursor = skipBlockComment(sql, cursor + 2);
      continue;
    }
    if (character === "'") {
      cursor = skipSingleQuotedString(sql, cursor + 1);
      continue;
    }
    if (character === '$') {
      const delimiter = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(cursor))?.[0];
      if (delimiter !== undefined) {
        const closingDelimiter = sql.indexOf(delimiter, cursor + delimiter.length);
        cursor = closingDelimiter < 0 ? sql.length : closingDelimiter + delimiter.length;
        continue;
      }
    }
    if (character === '"') {
      const identifier = readQuotedIdentifier(sql, cursor + 1);
      tokens.push({ type: 'quotedIdentifier', value: identifier.value });
      cursor = identifier.cursor;
      continue;
    }
    if (/[A-Za-z_]/.test(character)) {
      const start = cursor;
      cursor += 1;
      while (cursor < sql.length && /[A-Za-z0-9_$]/.test(sql[cursor])) {
        cursor += 1;
      }
      tokens.push({ type: 'word', value: sql.slice(start, cursor) });
      continue;
    }

    tokens.push({ type: 'symbol', value: character });
    cursor += 1;
  }

  return tokens;
}

function skipLineComment(sql, cursor) {
  while (cursor < sql.length && sql[cursor] !== '\n') {
    cursor += 1;
  }
  return cursor;
}

function skipBlockComment(sql, cursor) {
  let depth = 1;
  while (cursor < sql.length && depth > 0) {
    if (sql.startsWith('/*', cursor)) {
      depth += 1;
      cursor += 2;
    } else if (sql.startsWith('*/', cursor)) {
      depth -= 1;
      cursor += 2;
    } else {
      cursor += 1;
    }
  }
  return cursor;
}

function skipSingleQuotedString(sql, cursor) {
  while (cursor < sql.length) {
    if (sql[cursor] === "'" && sql[cursor + 1] === "'") {
      cursor += 2;
    } else if (sql[cursor] === '\\') {
      cursor += 2;
    } else if (sql[cursor] === "'") {
      return cursor + 1;
    } else {
      cursor += 1;
    }
  }
  return cursor;
}

function readQuotedIdentifier(sql, cursor) {
  let value = '';
  while (cursor < sql.length) {
    if (sql[cursor] === '"' && sql[cursor + 1] === '"') {
      value += '"';
      cursor += 2;
    } else if (sql[cursor] === '"') {
      return { cursor: cursor + 1, value };
    } else {
      value += sql[cursor];
      cursor += 1;
    }
  }
  return { cursor, value };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
