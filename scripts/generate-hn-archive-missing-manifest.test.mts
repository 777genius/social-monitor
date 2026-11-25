import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { generateHnArchiveManifestFile } from './generate-hn-archive-missing-manifest.js';

const time = '2026-11-18T12:00:00.000Z';
const reconciliation = { days: { '2026-11-18': { missingCount: 1, missing: [
  { id: '42', created_at_i: Date.parse(time) / 1000, pass: 'fixture' },
] } }, totals: { missing: 1 } };
const story = { id: 42, type: 'story', created_at: time, title: 'Synthetic story',
  author: 'fixture-author', url: null, text: null, points: 2, children: [] };

async function fixture() {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'hn-manifest-test-'));
  const source = join(root, 'reconciliation.json');
  const output = join(root, 'manifest.json');
  const bytes = Buffer.from(JSON.stringify(reconciliation));
  await writeFile(source, bytes, { mode: 0o600 });
  return { root, source, output, bytes };
}
const opts = (source: string, output: string, read: (url: string) => Promise<string>) => ({
  reconciliationPath: source, outputPath: output, now: new Date('2026-11-21T12:00:00Z'), jobId: 'synthetic', read,
});

test('publishes one private manifest bound to input and refuses to overwrite it', async () => {
  const f = await fixture();
  try {
    let calls = 0;
    const read = async () => { calls += 1; return JSON.stringify(story); };
    const result = await generateHnArchiveManifestFile(opts(f.source, f.output, read));
    const bytes = await readFile(f.output);
    const manifest = JSON.parse(bytes.toString('utf8'));
    assert.equal(result.count, 1);
    assert.equal((await stat(f.output)).mode & 0o777, 0o600);
    assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(manifest.items[0].provenance.reconciliationSha256, createHash('sha256').update(f.bytes).digest('hex'));
    await assert.rejects(generateHnArchiveManifestFile(opts(f.source, f.output, read)));
    assert.equal(calls, 1);
    assert.deepEqual(await readFile(f.output), bytes);
    assert.deepEqual((await readdir(f.root)).sort(), ['manifest.json', 'reconciliation.json']);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('refuses invalid UTF-8 and oversized reconciliation without provider access', async () => {
  const f = await fixture();
  try {
    let calls = 0;
    const read = async () => { calls += 1; return JSON.stringify(story); };
    await writeFile(f.source, Buffer.concat([Buffer.from('{"ignored":"'), Buffer.from([0xff]),
      Buffer.from('","days":{},"totals":{"missing":0}}')]));
    await assert.rejects(generateHnArchiveManifestFile(opts(f.source, f.output, read)));
    await truncate(f.source, 20 * 1024 * 1024 + 1);
    await assert.rejects(generateHnArchiveManifestFile(opts(f.source, f.output, read)));
    assert.equal(calls, 0);
    assert.deepEqual(await readdir(f.root), ['reconciliation.json']);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('provider failure leaves no manifest or staged output', async () => {
  const f = await fixture();
  try {
    await assert.rejects(generateHnArchiveManifestFile(opts(f.source, f.output, async () => { throw new Error('fixture'); })));
    assert.deepEqual(await readdir(f.root), ['reconciliation.json']);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('a competing publication during provider work is never replaced', async () => {
  const f = await fixture();
  try {
    await assert.rejects(generateHnArchiveManifestFile(opts(f.source, f.output, async () => {
      await writeFile(f.output, 'existing', { mode: 0o600 });
      return JSON.stringify(story);
    })));
    assert.equal(await readFile(f.output, 'utf8'), 'existing');
    assert.deepEqual((await readdir(f.root)).sort(), ['manifest.json', 'reconciliation.json']);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('refuses symlinked input or nonprivate output directory before provider work', async () => {
  const f = await fixture();
  try {
    let calls = 0;
    const read = async () => { calls += 1; return JSON.stringify(story); };
    const alias = join(f.root, 'alias.json');
    await symlink(f.source, alias);
    await assert.rejects(generateHnArchiveManifestFile(opts(alias, f.output, read)));
    await chmod(f.source, 0o644);
    await assert.rejects(generateHnArchiveManifestFile(opts(f.source, f.output, read)));
    await chmod(f.source, 0o600);
    await chmod(f.root, 0o755);
    await assert.rejects(generateHnArchiveManifestFile(opts(f.source, f.output, read)));
    assert.equal(calls, 0);
  } finally { await chmod(f.root, 0o700); await rm(f.root, { recursive: true, force: true }); }
});
