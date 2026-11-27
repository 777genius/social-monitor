import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const gate = fileURLToPath(new URL('./check-dependencies.mjs', import.meta.url));
const report = (vulnerabilities = {}) => ({ auditReportVersion: 2, vulnerabilities });
const high = { severity: 'high', via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-7589-6fvf-x4pw' }] };
const exception = { packageName: 'example', owner: 'test', expiresAt: '2099-12-31', mitigation: 'fixture', advisories: ['GHSA-7589-6fvf-x4pw'] };

const run = (t, payload, status, allowedExceptions = []) => {
  const cwd = mkdtempSync(join(tmpdir(), 'dependency-audit-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const bin = join(cwd, 'bin');
  mkdirSync(bin);
  mkdirSync(join(cwd, 'ops', 'security'), { recursive: true });
  writeFileSync(join(cwd, 'ops', 'security', 'dependency-audit-policy.json'), JSON.stringify({
    schemaVersion: 1, auditCommand: 'npm audit --json --audit-level=high',
    blockSeverities: ['high', 'critical'], allowedExceptions,
  }));
  const fixture = join(bin, 'fake-npm.cjs');
  writeFileSync(fixture, 'process.stdout.write(process.env.AUDIT_FIXTURE); process.exitCode = Number(process.env.AUDIT_STATUS);\n');
  if (process.platform === 'win32') {
    writeFileSync(join(bin, 'npm.cmd'), `@"${process.execPath}" "${fixture}"\r\n`);
  } else {
    writeFileSync(join(bin, 'npm'), `#!/bin/sh\nexec "${process.execPath}" "${fixture}"\n`, { mode: 0o755 });
  }
  const result = spawnSync(process.execPath, [gate], {
    cwd, encoding: 'utf8', env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
      AUDIT_FIXTURE: JSON.stringify(payload), AUDIT_STATUS: String(status) },
  });
  assert.ifError(result.error);
  return result;
};

test('valid clean and nonblocking audit reports pass', (t) => {
  for (const payload of [report(), report({ example: { severity: 'moderate' } })]) {
    const result = run(t, payload, 0);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Dependency audit contract OK/);
  }
});

test('blocking findings still require a matching approved exception', (t) => {
  const payload = report({ example: high });
  assert.notEqual(run(t, payload, 1).status, 0);
  assert.equal(run(t, payload, 1, [exception]).status, 0);
  assert.notEqual(run(t, payload, 1, [{ ...exception, advisories: ['GHSA-2222-2222-2222'] }]).status, 0);
});

test('registry errors and incomplete audit reports fail closed', (t) => {
  for (const [payload, status] of [
    [{ error: { code: 'E503', summary: 'registry unavailable' } }, 1],
    [{}, 0], [report([]), 0], [report({ example: {} }), 0],
    [{ ...report(), error: { code: 'E503' } }, 0], [report(), 1], [report(), 2],
  ]) {
    const result = run(t, payload, status);
    assert.notEqual(result.status, 0, JSON.stringify(payload));
    assert.doesNotMatch(result.stdout, /Dependency audit contract OK/);
  }
});

test('advisory-scoped exceptions require complete blocking evidence', async (t) => {
  const moderate = { severity: 'moderate' };
  const childException = { ...exception, packageName: 'child' };
  const wrong = { severity: 'high', url: 'https://github.com/advisories/GHSA-2222-2222-2222' };
  const cases = [
    ['direct', high.via, {}, true],
    ['mixed direct', [moderate, ...high.via], {}, true],
    ['derived', ['child'], { child: high }, true],
    ['mixed derived', ['child', ...high.via], { child: moderate }, true],
    ['missing via', undefined, {}, false],
    ['empty via', [], {}, false],
    ['non-array via', {}, {}, false],
    ['missing severity', [{}], {}, false],
    ['unknown severity', [{ severity: 'unknown' }, ...high.via], {}, false],
    ['null advisory', [null], {}, false],
    ['only moderate', [moderate], {}, false],
    ['missing child', ['child'], {}, false],
    ['nonblocking child only', ['child'], { child: moderate }, false],
    ['wrong direct advisory', [...high.via, wrong], {}, false],
    ['wrong derived advisory', ['child'], { child: { severity: 'high', via: [wrong] } }, false],
    ['unexcepted child', ['unknown'], { unknown: high }, false],
  ];
  for (const [name, via, others, allowed] of cases) {
    await t.test(name, (subtest) => {
      const result = run(subtest, report({ example: { severity: 'high', via }, ...others }), 1, [exception, childException]);
      if (allowed) {
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /Dependency audit contract OK/);
      } else {
        assert.notEqual(result.status, 0, result.stdout);
        assert.doesNotMatch(result.stdout, /Dependency audit contract OK/);
      }
    });
  }
});
