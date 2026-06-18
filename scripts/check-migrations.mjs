import { spawnSync } from 'node:child_process';
import { existsSync, globSync, readFileSync } from 'node:fs';

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
    ],
    capture: true,
  },
];

let migrationSql = '';
const migrationFiles = globSync('prisma/migrations/*/migration.sql').sort();

for (const command of commands) {
  const result =
    process.platform === 'win32'
      ? spawnSync(`npx ${command.args.join(' ')}`, {
          encoding: 'utf8',
          shell: true,
          stdio: command.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        })
      : spawnSync('npx', command.args, {
          encoding: 'utf8',
          stdio: command.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        });

  if (result.status !== 0) {
    if (command.capture) {
      process.stderr.write(result.stderr);
      process.stdout.write(result.stdout);
    }
    console.error(`${command.label} failed`);
    process.exit(result.status ?? 1);
  }

  if (command.capture) {
    migrationSql = result.stdout;
    process.stderr.write(result.stderr);
  }
}

const violations = [];
const committedMigrationSql = migrationFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

if (!migrationSql.includes('CREATE TABLE')) {
  violations.push('clean migration diff must create tables from the current Prisma schema');
}

if (!existsSync('prisma/migrations')) {
  violations.push('prisma/migrations must exist; production uses committed Prisma migration history');
}

if (migrationFiles.length === 0) {
  violations.push('at least one committed Prisma migration.sql file is required');
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
  const createTable = `CREATE TABLE "${tableName}"`;
  if (!committedMigrationSql.includes(createTable)) {
    violations.push(`committed migration history must create mapped Prisma table "${tableName}"`);
  }
}

if (migrationFiles.length > 0 && normalizeSql(committedMigrationSql) !== normalizeSql(migrationSql)) {
  violations.push('committed migration history must match the current Prisma schema clean diff');
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

function normalizeSql(sql) {
  return sql
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}
