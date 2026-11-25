import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RssSep24PinnedScope } from '../../recover-rss-sep24-verified';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
export const sha = (v: string | Buffer): string => createHash('sha256').update(v).digest('hex');
export const exactJson = (v: unknown): string => JSON.stringify(v, null, 2) + '\n';
export const FEED = 'https://example.test/synthetic-test.xml';
export const CONFIG = { feedUrl: FEED, maxItems: 30,
  targetPublishedWindow: { startInclusive: '2026-09-24T00:00:00.000Z', endExclusive: '2026-09-25T00:00:00.000Z' } };
export function scope(): RssSep24PinnedScope {
  return { tenantId: tenantId(randomUUID()), workspaceId: workspaceId(randomUUID()),
    interestId: randomUUID(), sourceBindingId: randomUUID(), scanPolicyId: randomUUID() };
}
export async function capture(base: string, s: RssSep24PinnedScope) {
  const inputRoot = join(base, 'input'), journalDir = join(base, 'journal');
  await mkdir(base, { mode: 0o700 }); await mkdir(inputRoot, { mode: 0o700 }); await mkdir(journalDir, { mode: 0o700 });
  const ids = ['existing', 'new-a', 'new-b'].map(v => `TEST-${randomUUID()}-${v}`);
  const items = exactJson({ schemaVersion: 1, day: '2026-09-24', items: ids.map(externalId => ({ externalId,
    canonicalUrl: `https://example.test/${externalId}`, title: 'Synthetic TEST article',
    body: 'Synthetic content created solely for this isolated importer qualification.',
    publishedAt: '2026-09-24T08:00:00.000Z', metadata: { kind: 'rss_item', feedUrl: FEED, nativeContentComplete: true } })) });
  const bindings = exactJson([{ bindingId: s.sourceBindingId, status: 'ENABLED', config: CONFIG }]);
  const manifest = exactJson({ schemaVersion: 1, day: '2026-09-24', providerKey: 'rss', bindingId: s.sourceBindingId,
    bindingSha256: sha(bindings), scope: s, scanMode: 'read_only', sourceStatus: 'partial',
    window: { from: CONFIG.targetPublishedWindow.startInclusive, to: CONFIG.targetPublishedWindow.endExclusive },
    selectedIds: ids, itemsSha256: sha(items) });
  const pins = exactJson({ schemaVersion: 1, day: '2026-09-24', scope: s,
    bindingSha256: sha(bindings), manifestSha256: sha(manifest), itemsSha256: sha(items) });
  for (const [name, contents] of [['bindings-sanitized.json', bindings], ['manifest.json', manifest],
    ['items.json', items], ['pins-rss-sep24.json', pins]]) {
    await writeFile(join(inputRoot, name!), contents!, { flag: 'wx', mode: 0o600 });
  }
  return { inputRoot, journalDir, expectedPinsSha256: sha(pins), ids };
}
