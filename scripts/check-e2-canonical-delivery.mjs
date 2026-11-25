import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const exactBase = 'fdf2fc3efdcc69fcd6912a760ce66cccea7b60ea';
const historicalBase = 'fa6bb2036d792bcc868d3cd795ffe1c0fb3f169f';
const originalDelivery = 'a519dca7077fe7a11ad6b7e7ff9f443e845c277c';
const baselinePath = 'test/fixtures/x-canonical/baseline.ls-tree.json';
export const correctionPaths = [
  'libs/ingestion/domain/x-observation/x-canonical-graph-policy.spec.ts',
  'scripts/check-e2-canonical-delivery.mjs',
  'scripts/check-e2-canonical-delivery.test.mjs',
  'docs/e2-canonical-delivery-verification.md',
];
const digest = (algorithm, bytes) => createHash(algorithm).update(bytes).digest('hex');

// Bounded PR333 correction gate. Run the reviewed verifier, never a candidate's
// replacement verifier. This is deliberately separate from ordinary Jest/CI.
export function verifyDelivery(root) {
  const git = (...args) => execFileSync('git', ['--no-replace-objects', '-C', root, ...args],
    { maxBuffer: 32 * 1024 * 1024 });
  const parents = (sha) => git('show', '-s', '--format=%P', sha).toString().trim();
  assert.equal(parents(exactBase), originalDelivery, 'exact-base ancestry drift');
  assert.equal(parents(originalDelivery), historicalBase, 'historical delivery ancestry drift');
  const head = git('rev-parse', 'HEAD').toString().trim();
  // Only the pinned delivery or ONE mechanical correction commit is admitted.
  // Merges, unrelated ancestry and change/revert chains are not reviewed delivery.
  if (head !== exactBase) assert.equal(parents(head), exactBase, 'unreviewed ancestry');
  const tree = (sha) => git('ls-tree', '-rz', sha);
  const parseTree = (bytes) => new Map(bytes.toString().split('\0').filter(Boolean).map((entry) => {
    const tab = entry.indexOf('\t');
    return [entry.slice(tab + 1), entry.slice(0, tab)];
  }));
  const historical = tree(historicalBase);
  assert.equal(historical.length, 795142);
  assert.equal(digest('sha256', historical), '20ff7f0ad57c6591f53c9e3567b672cec79940a654c952878310527bcb45e145');
  const sealed = git('show', `${exactBase}:${baselinePath}`);
  assert.equal(digest('sha256', sealed), '616e75145832ecd3826a92cfc253d821de92ade0175215c60e740bb55601a8f7');
  const tuples = JSON.parse(sealed.toString());
  assert.equal(tuples.length, 6318);
  assert.deepEqual(Buffer.from(tuples.map(({ mode, kind, blob, path }) =>
    `${mode} ${kind} ${blob}\t${path}\0`).join('')), historical);
  const baseTree = parseTree(tree(exactBase));
  for (const [path, entry] of parseTree(historical)) {
    assert.equal(baseTree.get(path), entry, `historical delivery drift: ${path}`);
  }
  const allowed = new Set(correctionPaths);
  const candidateTree = parseTree(tree(head));
  for (const path of new Set([...baseTree.keys(), ...candidateTree.keys()])) {
    if (!allowed.has(path)) assert.equal(candidateTree.get(path), baseTree.get(path), `delivery tree drift: ${path}`);
  }
  // Read raw workspace bytes and modes: Git diff alone can hide chmod, filters,
  // assume-unchanged/skip-worktree entries, or missing tracked files.
  for (const [path, entry] of baseTree) {
    if (allowed.has(path)) continue;
    const [mode, kind, blob] = entry.split(' ');
    assert.equal(kind, 'blob', `unsupported tree entry: ${path}`);
    const fullPath = resolve(root, path), stat = lstatSync(fullPath);
    const actualMode = stat.isSymbolicLink() ? '120000' : stat.isFile()
      ? (stat.mode & 0o111 ? '100755' : '100644') : 'unsupported';
    assert.equal(actualMode, mode, `delivery mode drift: ${path}`);
    const bytes = stat.isSymbolicLink() ? Buffer.from(readlinkSync(fullPath)) : readFileSync(fullPath);
    assert.equal(digest('sha1', Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])), blob,
      `delivery blob drift: ${path}`);
  }
  for (const path of correctionPaths) {
    const stat = lstatSync(resolve(root, path));
    assert.ok(stat.isFile() && !(stat.mode & 0o111), `correction must be a regular non-executable file: ${path}`);
    if (head !== exactBase) assert.match(candidateTree.get(path) ?? '', /^100644 blob [a-f0-9]{40}$/,
      `missing/mode drift in committed correction: ${path}`);
  }
  const additions = git('ls-files', '--others', '--exclude-standard', '-z').toString().split('\0').filter(Boolean);
  const indexed = git('diff', '--cached', '--name-only', '-z', exactBase).toString().split('\0').filter(Boolean);
  for (const path of [...additions, ...indexed]) assert.ok(allowed.has(path), `unauthorized delivery path: ${path}`);
  return { exactBase, historicalBase, head, preservedPaths: baseTree.size, correctionPaths };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    assert.ok(process.argv.length <= 3, 'usage: node scripts/check-e2-canonical-delivery.mjs [checkout]');
    console.log(JSON.stringify(verifyDelivery(resolve(process.argv[2] ?? '.')), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
