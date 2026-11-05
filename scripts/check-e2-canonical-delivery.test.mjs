import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { correctionPaths, exactBase, verifyDelivery } from './check-e2-canonical-delivery.mjs';

const source = resolve(import.meta.dirname, '..');
const temp = mkdtempSync(join(tmpdir(), 'sm-e2-baseline-scope-controls-'));
const fixture = join(temp, 'checkout');
const ordinarySpec = correctionPaths[0];
const unauthorized = 'libs/ingestion/domain/x-observation/x-canonical-graph-policy.ts';
const unrelated = 'README.md';
const git = (...args) => execFileSync('git', ['-C', fixture, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function commit(message) {
  return git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'core.hooksPath=/dev/null', 'commit', '--no-gpg-sign', '-m', message);
}
function withMutation(path, mutate, check) {
  const full = join(fixture, path), original = readFileSync(full);
  try { mutate(full); check(); } finally {
    rmSync(full, { force: true });
    writeFileSync(full, original, { mode: 0o644 });
  }
}
function ordinary() {
  const result = spawnSync(process.execPath, [join(source, 'node_modules/jest/bin/jest.js'),
    '--config', 'jest.config.ts', '--runInBand', '--no-cache', '--runTestsByPath', ordinarySpec],
  { cwd: fixture, encoding: 'utf8', timeout: 120000 });
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /Tests:\s+3 passed/);
}

before(() => {
  execFileSync('git', ['clone', '--shared', '--no-checkout', source, fixture], { stdio: 'pipe' });
  git('-c', 'core.hooksPath=/dev/null', 'checkout', '--detach', exactBase);
  for (const path of correctionPaths) {
    mkdirSync(dirname(join(fixture, path)), { recursive: true });
    copyFileSync(join(source, path), join(fixture, path));
  }
  symlinkSync(join(source, 'node_modules'), join(temp, 'node_modules'), 'dir');
});
after(() => rmSync(temp, { recursive: true, force: true }));

test('exact fdf delivery plus bounded correction preserves every historical path', () => {
  assert.equal(verifyDelivery(fixture).preservedPaths, 6377);
});
test('ordinary Jest passes before and after an unrelated later main edit', () => {
  ordinary();
  withMutation(unrelated, (path) => writeFileSync(path, 'Synthetic future main documentation change.\n'), () => {
    ordinary();
    assert.throws(() => verifyDelivery(fixture), /delivery blob drift: README.md/);
  });
});
test('unauthorized E2 blob, missing file, executable mode and symlink drift fail closed', () => {
  withMutation(unauthorized, (path) => writeFileSync(path, '// unauthorized E2 delivery edit\n'),
    () => assert.throws(() => verifyDelivery(fixture), /delivery blob drift/));
  withMutation(unauthorized, (path) => rmSync(path),
    () => assert.throws(() => verifyDelivery(fixture), /ENOENT/));
  withMutation(unauthorized, (path) => chmodSync(path, 0o755),
    () => assert.throws(() => verifyDelivery(fixture), /delivery mode drift/));
  withMutation(unauthorized, (path) => { rmSync(path); symlinkSync('x-canonical-days.ts', path); },
    () => assert.throws(() => verifyDelivery(fixture), /delivery mode drift/));
});
test('extra untracked and staged paths are rejected', () => {
  const extra = join(fixture, 'unauthorized-e2-fixture.txt');
  try {
    writeFileSync(extra, 'synthetic\n');
    assert.throws(() => verifyDelivery(fixture), /unauthorized delivery path/);
    git('add', 'unauthorized-e2-fixture.txt');
    assert.throws(() => verifyDelivery(fixture), /unauthorized delivery path/);
  } finally { git('restore', '--staged', 'unauthorized-e2-fixture.txt'); rmSync(extra); }
});
test('sealed baseline corruption still fails ordinary Jest', () => {
  withMutation('test/fixtures/x-canonical/baseline.ls-tree.json', (path) => writeFileSync(path, '[]\n'), () => {
    const result = spawnSync(process.execPath, [join(source, 'node_modules/jest/bin/jest.js'),
      '--config', 'jest.config.ts', '--runInBand', '--runTestsByPath', ordinarySpec],
    { cwd: fixture, encoding: 'utf8', timeout: 120000 });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /verifies the sealed historical main baseline representation/);
    assert.match(result.stderr, /616e75145832ecd3826a92cfc253d821de92ade0175215c60e740bb55601a8f7/);
  });
});
test('committed unauthorized E2 edit fails; committed later main edit passes ordinary Jest', () => {
  git('add', ...correctionPaths);
  const cleanTree = git('write-tree');
  for (const path of [unauthorized, unrelated]) {
    writeFileSync(join(fixture, path), '// synthetic unauthorized delivery change\n');
    git('add', path);
    const candidate = git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit-tree', git('write-tree'), '-p', exactBase, '-m', 'synthetic delivery');
    git('-c', 'core.hooksPath=/dev/null', 'checkout', '--detach', candidate);
    assert.throws(() => verifyDelivery(fixture), /delivery tree drift/);
    if (path === unrelated) ordinary();
    git('read-tree', '--reset', '-u', cleanTree);
  }
  // Restore only this disposable fixture to the pinned base plus correction.
  git('-c', 'core.hooksPath=/dev/null', 'checkout', '--detach', exactBase);
  git('read-tree', '--reset', '-u', cleanTree);
});
test('one mechanical correction is admitted; merged or extra ancestry is refused', () => {
  git('add', ...correctionPaths);
  commit('bounded correction fixture');
  assert.notEqual(verifyDelivery(fixture).head, exactBase);
  const correction = git('rev-parse', 'HEAD');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'core.hooksPath=/dev/null', 'commit', '--allow-empty', '--no-gpg-sign', '-m', 'unreviewed ancestry');
  assert.throws(() => verifyDelivery(fixture), /unreviewed ancestry/);
  // A merge with an unchanged tree still carries unreviewed ancestry.
  const merge = git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit-tree', `${correction}^{tree}`, '-p', exactBase, '-p', correction, '-m', 'synthetic merge');
  git('-c', 'core.hooksPath=/dev/null', 'checkout', '--detach', merge);
  assert.throws(() => verifyDelivery(fixture), /unreviewed ancestry/);
});
