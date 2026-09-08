import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

const fixture = 'test/fixtures/x-canonical/sdk-installed-source/Scweet/account_session.py.txt';
const elsewhere = 'test/fixtures/unrelated.txt';
const assignment = (value) => `DEFAULT_X_BEARER_TOKEN = ${value}\n`;
const synthetic = ['prod', 'bearer', 'token'].join('.');

// Execute the whole default scanner, including its policy self-checks and all
// detectors, in a disposable tracked repository. No SDK bytes are embedded.
const pinnedSha = 'bc46ce04e044b1b0db6df24dd82b6c1bbc1b7985da183dd02c8cfc5ae7824bd5';
const syntax = `${assignment('(')}    "token-value"\n)\n`;
const sha = (content) => createHash('sha256').update(content).digest('hex');

function scan(t, file, content, approvedContent) {
  const cwd = mkdtempSync(join(tmpdir(), 'check-secrets-regression-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const path of ['scripts/check-secrets.mjs', 'ops/security/secret-scan-allowlist.json']) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    copyFileSync(new URL(`../${path}`, import.meta.url), join(cwd, path));
  }
  if (approvedContent !== undefined) {
    // Substitute only the digest in the disposable scanner, never the policy
    // or SDK bytes: standalone CI has no vendor fixture on this base.
    const script = join(cwd, 'scripts/check-secrets.mjs');
    const source = readFileSync(script, 'utf8');
    assert.equal(source.split(pinnedSha).length, 2);
    writeFileSync(script, source.replace(pinnedSha, sha(approvedContent)));
  }
  mkdirSync(dirname(join(cwd, file)), { recursive: true });
  writeFileSync(join(cwd, file), content);
  execFileSync('git', ['init', '--quiet'], { cwd });
  execFileSync('git', ['add', '--', file], { cwd });
  return spawnSync(process.execPath, ['scripts/check-secrets.mjs'], { cwd, encoding: 'utf8' });
}

function expectScan(t, file, content, status, reason, approvedContent) {
  const result = scan(t, file, content, approvedContent);
  assert.equal(result.status, status);
  if (reason) assert.ok(result.stderr.includes(reason));
  else assert.equal(result.stdout.trim(), 'Secret scan contract OK');
}

test('accepts only the scoped multiline assignment syntax', (t) => {
  expectScan(t, fixture, syntax, 0, undefined, syntax);
});

for (const file of [elsewhere, `${fixture}.txt`, fixture.replace('Scweet/', 'Other/')]) {
  test(`rejects the opening parenthesis outside the exact path: ${file}`, (t) => {
    expectScan(t, file, syntax, 1, 'documented placeholder', syntax);
  });
}

for (const file of [fixture, elsewhere]) {
  for (const value of [synthetic, `"${synthetic}"`, `(${synthetic})`]) {
    test(`rejects populated same-line assignment at ${file}: ${value}`, (t) => {
      expectScan(t, file, assignment(value), 1, 'documented placeholder', assignment(value));
    });
  }
  const negatives = [
    [['-----BEGIN ', 'PRIVATE KEY-----'].join(''), 'private key block'],
    [`Bearer ${synthetic}`, 'bearer token literal'],
    [['smk', 'prod', 'secret'].join('_'), 'generated API/webhook key'],
    [['whsec', 'prod', 'secret'].join('_'), 'generated API/webhook key'],
    [['postgresql:', `//user:${synthetic}@example.invalid/db`].join(''), 'credential URL password'],
  ];
  for (const [content, reason] of negatives) {
    test(`preserves ${reason} detection at ${file}`, (t) => {
      expectScan(t, file, content, 1, reason, content);
    });
  }
  test(`preserves empty, placeholder and token-count handling at ${file}`, (t) => {
    expectScan(t, file, 'EMPTY_TOKEN=\nNEXT_KEY=\nOPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS=2500\n'
      + assignment('"token-value"'), 0);
  });
}

test('a scoped parenthesis does not skip later detections in the same file', (t) => {
  const content = syntax + `Bearer ${synthetic}\n`;
  expectScan(t, fixture, content, 1, 'bearer token literal', content);
});

test('the production digest rejects unreviewed syntax and any changed bytes', (t) => {
  expectScan(t, fixture, syntax, 1, 'documented placeholder');
  for (const changed of [syntax + '# changed\n', syntax.replace('token-value', synthetic)]) {
    expectScan(t, fixture, changed, 1, 'documented placeholder', syntax);
  }
});
