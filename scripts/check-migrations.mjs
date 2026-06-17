import { spawnSync } from 'node:child_process';

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

if (!migrationSql.includes('CREATE TABLE')) {
  violations.push('clean migration diff must create tables from the current Prisma schema');
}

for (const destructive of ['DROP TABLE', 'DROP SCHEMA', 'TRUNCATE TABLE']) {
  if (migrationSql.includes(destructive)) {
    violations.push(`clean migration diff must not contain destructive statement: ${destructive}`);
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Migration schema checks OK');
