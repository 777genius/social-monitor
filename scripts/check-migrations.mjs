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
const committedMigrationSql = migrationFiles
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

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
  const createTable = `CREATE TABLE "${tableName}"`;
  if (!committedMigrationSql.includes(createTable)) {
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
