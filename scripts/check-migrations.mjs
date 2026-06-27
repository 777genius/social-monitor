import { spawnSync } from 'node:child_process';
import { existsSync, globSync, readFileSync } from 'node:fs';

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
    ],
    capture: true,
  },
];

let migrationSql = '';
const migrationFiles = globSync('prisma/migrations/*/migration.sql').sort();
const repairMigrationFiles = migrationFiles.filter((file) => file.includes('_repair_'));
const canonicalMigrationFiles = migrationFiles.filter((file) => !repairMigrationFiles.includes(file));

for (const command of commands) {
  const result =
    process.platform === 'win32'
      ? spawnSync(`npx ${command.args.join(' ')}`, {
          encoding: 'utf8',
          env: prismaCommandEnv,
          shell: true,
          stdio: command.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        })
      : spawnSync('npx', command.args, {
          encoding: 'utf8',
          env: prismaCommandEnv,
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
const canonicalMigrationSql = canonicalMigrationFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
const repairMigrationSql = repairMigrationFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
const committedMigrationSql = [canonicalMigrationSql, repairMigrationSql].filter((sql) => sql.length > 0).join('\n');

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

if (canonicalMigrationFiles.length > 0 && normalizeSql(canonicalMigrationSql) !== normalizeSql(migrationSql)) {
  violations.push('committed migration history must match the current Prisma schema clean diff');
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

function normalizeSql(sql) {
  return sql
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}
