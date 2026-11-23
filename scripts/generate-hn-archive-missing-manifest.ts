import { constants } from 'node:fs';
import { link, lstat, open, realpath, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';
import { generateHnArchiveManifest, readHnArchiveBody, type HnArchiveBodyReader } from './lib/hn-archive-manifest-generation';
import { parseHnMissingReconciliation } from './lib/hn-archive-reconciliation';

const maxInputBytes = 20 * 1024 * 1024;
const digest = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');

export async function readReconciliation(path: string): Promise<Buffer> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size > maxInputBytes || before.size === 0 ||
        (before.mode & 0o077) !== 0 || (before.uid !== process.getuid?.() && before.uid !== 0)) {
      throw new Error('Unsafe reconciliation input');
    }
    const bytes = Buffer.allocUnsafe(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await file.read(bytes, offset, bytes.length - offset, offset);
      if (result.bytesRead === 0) throw new Error('Reconciliation changed during reading');
      offset += result.bytesRead;
    }
    const extra = Buffer.allocUnsafe(1);
    if ((await file.read(extra, 0, 1, offset)).bytesRead !== 0) throw new Error('Reconciliation changed during reading');
    const after = await file.stat();
    if (bytes.length !== before.size || before.dev !== after.dev || before.ino !== after.ino ||
        before.size !== after.size || before.mode !== after.mode || before.uid !== after.uid || before.nlink !== after.nlink ||
        before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
      throw new Error('Reconciliation changed during reading');
    }
    return bytes;
  } finally { await file.close(); }
}

export async function privateOutputPath(path: string): Promise<string> {
  const target = resolve(path);
  const parent = dirname(target);
  const info = await lstat(parent);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 ||
      info.uid !== process.getuid?.() || await realpath(parent) !== parent || basename(target).startsWith('.')) {
    throw new Error('Output directory must be private and canonical');
  }
  try { await lstat(target); throw new Error('Manifest output already exists'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return target;
}

/** Writes no manifest until every provider response and association has passed validation. */
export async function publishPrivateHnBytes(path: string, output: Buffer): Promise<void> {
  const target = await privateOutputPath(path);
  const temporary = resolve(dirname(target), `.hn-archive-${randomUUID()}.tmp`);
  const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  let linked = false;
  try {
    await file.writeFile(output);
    await file.sync();
    await file.close();
    await link(temporary, target); // Exclusive publication; never replace an existing manifest.
    linked = true;
    await unlink(temporary);
    const directory = await open(dirname(target), constants.O_RDONLY);
    try { await directory.sync(); } finally { await directory.close(); }
  } catch (error) {
    await file.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    if (linked) throw new Error('Manifest publication uncertain; inspect output before retrying');
    throw error;
  }
}

export async function generateHnArchiveManifestFile(input: {
  readonly reconciliationPath: string; readonly outputPath: string; readonly read: HnArchiveBodyReader;
  readonly now: Date; readonly jobId: string;
}): Promise<Readonly<{ count: number; sha256: string; omittedComments: number }>> {
  const target = await privateOutputPath(input.outputPath);
  const bytes = await readReconciliation(input.reconciliationPath);
  const reconciliation = parseHnMissingReconciliation(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  const manifest = await generateHnArchiveManifest({ ...reconciliation, generatedAt: input.now,
    reconciliationSha256: digest(bytes), jobId: input.jobId, read: input.read });
  const output = Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8');
  await publishPrivateHnBytes(target, output);
  return { count: manifest.count, sha256: digest(output),
    omittedComments: manifest.items.reduce((sum, item) => sum + item.provenance.omittedComments, 0) };
}

async function main(): Promise<void> {
  if (process.argv.length !== 4) throw new Error('Expected reconciliation input and private output path');
  const result = await generateHnArchiveManifestFile({ reconciliationPath: process.argv[2]!, outputPath: process.argv[3]!,
    now: new Date(), jobId: `hn-archive-${randomUUID()}`, read: readHnArchiveBody });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (typeof require !== 'undefined' && require.main === module) {
  void main().catch(() => {
    process.stderr.write('HN manifest generation failed or publication is uncertain; inspect output before retrying\n');
    process.exitCode = 1;
  });
}
