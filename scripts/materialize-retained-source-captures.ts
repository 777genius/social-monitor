/** Operator composition only. Admission/backup/quiet checks precede invocation externally. */
import { constants, openSync, closeSync, fstatSync, readSync, writeSync, fsyncSync, ftruncateSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createPrismaPgRuntimeConnection, resolvePostgresRuntimePoolConfig,
  type PrismaPgRuntimeClientConstructor } from '@social-monitor/platform-persistence';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import { PrismaRetainedSourceCaptureRepository, type RetainedCaptureSqlClient } from '../libs/ingestion/adapters/persistence/prisma/prisma-retained-source-capture.repository';
import type { RetainedCaptureBatch } from '../libs/ingestion/ports/retained-source-capture-repository';

type Client = RetainedCaptureSqlClient & { $disconnect(): Promise<void> };
export function readRetainedCapturePlan(path: string, expectedSha256: string): RetainedCaptureBatch {
  privateParent(path);
  if (!/^[a-f0-9]{64}$/u.test(expectedSha256)) throw new Error('Invalid plan digest');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid?.() ||
      (stat.mode & 0o777) !== 0o600 || stat.size > 131_072) throw new Error('Invalid plan custody');
    const bounded = Buffer.alloc(131_073);
    let count = 0;
    while (count < bounded.length) {
      const read = readSync(fd,bounded,count,bounded.length-count,null);
      if (read === 0) break;
      count += read;
    }
    if (count > 131_072) throw new Error('Plan exceeds byte ceiling');
    const bytes = bounded.subarray(0,count);
    if (createHash('sha256').update(bytes).digest('hex') !== expectedSha256) throw new Error('Plan changed');
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid plan');
    const b = value as Record<string, unknown>;
    if (Object.keys(b).sort().join() !== ['interestId','periodEndedAt','periodStartedAt','targets','tenantId','workspaceId'].sort().join() ||
      !['interestId','periodEndedAt','periodStartedAt','tenantId','workspaceId'].every((key) => typeof b[key] === 'string') ||
      !Array.isArray(b.targets) || b.targets.some((target: unknown) => target === null || typeof target !== 'object' ||
        Array.isArray(target) || Object.keys(target).sort().join() !== 'expectedRowSha256,sourceItemId' ||
        Object.values(target).some((entry: unknown) => typeof entry !== 'string'))) throw new Error('Invalid plan');
    return b as unknown as RetainedCaptureBatch;
  } finally { closeSync(fd); }
}
function privateParent(path: string): void {
  if (!path.startsWith('/') || resolve(path) !== path || realpathSync(dirname(path)) !== dirname(path)) throw new Error('Invalid private path');
  const parent = lstatSync(dirname(path));
  if (!parent.isDirectory() || parent.uid !== process.getuid?.() || (parent.mode & 0o777) !== 0o700) throw new Error('Invalid private parent');
}
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 6 || args[0] !== '--plan' || args[2] !== '--sha256' || args[4] !== '--receipt') throw new Error('Invalid arguments');
  const batch = readRetainedCapturePlan(args[1]!, args[3]!);
  privateParent(args[5]!);
  const fd = openSync(args[5]!, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  const parent = openSync(dirname(args[5]!), constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    // An uncertain commit leaves this durable intent. Never retry by changing its key.
    writeSync(fd, JSON.stringify({ status: 'intent', planSha256: args[3] })); fsyncSync(fd); fsyncSync(parent);
    const Prisma = loadPrismaRuntimeClient<PrismaPgRuntimeClientConstructor<Client>>();
    const runtime = await createPrismaPgRuntimeConnection(resolvePostgresRuntimePoolConfig(process.env), Prisma, (lease) => lease);
    try {
      const result = await new PrismaRetainedSourceCaptureRepository(runtime.client).materialize(batch);
      ftruncateSync(fd, 0);
      writeSync(fd, JSON.stringify({ status: result.ok ? 'completed' : 'refused', planSha256: args[3], result }), 0, 'utf8');
      fsyncSync(fd);
      if (!result.ok) process.exitCode = 1;
    } finally { await runtime.close(); }
  } finally { closeSync(fd); closeSync(parent); }
}
if (require.main === module) main().catch(() => { process.stderr.write('Retained capture operation failed; preserve intent\n'); process.exitCode = 1; });
