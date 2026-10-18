import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const digest = /^[a-f0-9]{64}$/u;
const dayPattern = /^\d{4}-\d{2}-\d{2}$/u;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(canonical).join(',')}]`
  : value !== null && typeof value === 'object'
    ? `{${Object.keys(value as Record<string, unknown>).sort().map(key =>
      `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
    : JSON.stringify(value);
function need(value: unknown, reason: string): asserts value { if (!value) throw new Error(reason); }
function record(value: unknown, reason: string): Record<string, unknown> {
  need(value !== null && typeof value === 'object' && !Array.isArray(value), reason);
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[], reason: string): void {
  need(Object.keys(value).sort().join(',') === [...keys].sort().join(','), reason);
}
export function planHnArchiveMissingPackets(manifestInput: unknown, env = process.env): readonly Record<string, unknown>[] {
  const manifest = record(manifestInput, 'HN manifest object required');
  exactKeys(manifest, ['generatedAt','jobId','window','count','fetchErrors','items','itemsSha256'],
    'HN manifest shape invalid');
  need(manifest.fetchErrors === 0 &&
    manifest.items instanceof Array && manifest.count === manifest.items.length &&
    digest.test(String(manifest.itemsSha256)), 'HN manifest integrity invalid');
  const scope = record(JSON.parse(env.MISSING_IMPORT_SCOPE_JSON ?? ''), 'HN import scope required');
  exactKeys(scope, ['tenantId','workspaceId','interestId','sourceBindingId','scanPolicyId'], 'HN import scope shape invalid');
  need(Object.values(scope).every(value => typeof value === 'string' && uuidPattern.test(value)), 'HN import scope IDs invalid');
  const bindingConfig = env.MISSING_IMPORT_BINDING_CONFIG;
  need(typeof bindingConfig === 'string' && bindingConfig.length > 0, 'HN binding config required');
  const items = manifest.items.map((item, index) => {
    const value = record(item, `HN item ${index} invalid`);
    need(value.externalId === `hn:${value.objectId}` && /^hn:\d+$/u.test(String(value.externalId)) &&
      dayPattern.test(String(value.publishedUtcDate)) && typeof value.title === 'string' &&
      value.title.trim().length > 0 && value.createdAt !== null &&
      Number.isFinite(Date.parse(String(value.createdAt))) && value.comments instanceof Array &&
      value.comments.length === value.commentCount, `HN item ${index} invalid`);
    return value;
  });
  const byDay = new Map<string, Record<string, unknown>[]>();
  for (const item of items) {
    const day = String(item.publishedUtcDate);
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  }
  return [...byDay.entries()].sort(([left], [right]) => left.localeCompare(right)).flatMap(([day, dayItems]) => {
    const chunks: Record<string, unknown>[][] = [];
    for (let index = 0; index < dayItems.length; index += 100) chunks.push(dayItems.slice(index, index + 100));
    return chunks.map((chunk, index) => {
      const selectedIds = chunk.map(item => String(item.externalId));
      const semanticKey = hash(canonical({
        kind: 'hn-archive-missing.v1', day, itemsSha256: manifest.itemsSha256, selectedIds,
      }));
      const packet = {
        schemaVersion: 1, kind: 'hn-archive-missing.v1', day, providerKey: 'hacker-news',
        manifestSha256: hash(JSON.stringify(manifest)), itemsSha256: manifest.itemsSha256,
        scope, bindingConfig, bindingConfigSha256: hash(bindingConfig), selectedIds, items: chunk,
      };
      const unsigned = {
        schemaVersion: 1, kind: 'hn-archive-missing.v1', day, providerKey: 'hacker-news',
        coverage: 'PARTIAL_ARCHIVED_OBSERVATIONS', semanticKey, packetSha256: hash(JSON.stringify(packet)),
        manifestSha256: packet.manifestSha256, itemsSha256: manifest.itemsSha256, scope,
        bindingConfig, bindingConfigSha256: packet.bindingConfigSha256,
        selectedIds, candidateIds: selectedIds,
      };
      return { ordinal: index + 1, packet, plan: { ...unsigned, planSha256: hash(JSON.stringify(unsigned)) } };
    });
  });
}
export async function writeHnArchiveMissingPackets(manifestPath: string, outputDir: string): Promise<readonly string[]> {
  const planned = planHnArchiveMissingPackets(JSON.parse(await readFile(manifestPath, 'utf8')));
  const root = resolve(outputDir);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const written: string[] = [];
  for (const entry of planned) {
    const packet = record(entry.packet, 'HN planned packet invalid');
    const day = String(packet.day), ordinal = String(entry.ordinal).padStart(4, '0');
    const directory = join(root, day, ordinal);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(join(directory, 'packet.json'), JSON.stringify(packet) + '\n',
      { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await writeFile(join(directory, 'plan.json'), JSON.stringify(entry.plan) + '\n',
      { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    written.push(directory);
  }
  return written;
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === __filename) {
  if (process.argv.length !== 4) throw new Error('Usage: plan-hn-archive-missing-packets.ts MANIFEST_PATH OUTPUT_DIR');
  void writeHnArchiveMissingPackets(process.argv[2]!, process.argv[3]!).then(paths =>
    process.stdout.write(JSON.stringify(paths) + '\n')).catch(() => { process.exitCode = 1; });
}
