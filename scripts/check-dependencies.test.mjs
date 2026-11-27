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

test('derived exceptions preserve the original advisory scope across the graph', async (t) => {
  const wrongId = 'GHSA-2222-2222-2222';
  const wrong = { severity: 'high', via: [{ severity: 'high', url: `https://github.com/advisories/${wrongId}` }] };
  const derived = (...via) => ({ severity: 'high', via });
  const scoped = (packageName, advisories = exception.advisories) => ({ ...exception, packageName, advisories });
  const broad = (packageName) => ({ ...exception, packageName, advisories: undefined });
  const cases = [
    ['different child scope', { child: wrong }, [scoped('child', [wrongId])], false],
    ['package-wide child with unrelated advisory', { child: wrong }, [broad('child')], false],
    ['package-wide child with matching advisory', { child: high }, [broad('child')], true],
    ['grandchild with unrelated advisory', { child: derived('grandchild'), grandchild: wrong }, [broad('child'), broad('grandchild')], false],
    ['matching multihop chain', { child: derived('grandchild'), grandchild: high }, [scoped('child'), scoped('grandchild')], true],
    ['cycle without leaf', { child: derived('example') }, [broad('child')], false],
    ['cycle with direct matching leaf', { child: derived('example', ...high.via) }, [broad('child')], true],
    ['cycle with unrelated advisory', { child: derived('example', ...wrong.via) }, [broad('child')], false],
    ['cycle reaches matching leaf through sibling', { child: derived('left', 'right'), left: derived('child'), right: high }, ['child', 'left', 'right'].map((name) => broad(name)), true],
    ['matching sibling cannot cover a leafless cycle', { child: derived('left', 'right'), left: high, right: derived('loop'), loop: derived('right') }, ['child', 'left', 'right', 'loop'].map((name) => broad(name)), false],
    ['nonblocking child of broad package needs no exception', { child: derived('low', ...high.via), low: { severity: 'low' } }, [broad('child')], true],
    ['nonblocking child of scoped package needs no exception', { child: derived('moderate', ...high.via), moderate: { severity: 'moderate' } }, [scoped('child')], true],
    ['package-wide child without evidence', { child: { severity: 'high' } }, [broad('child')], false],
    ['package-wide child with invalid evidence', { child: derived(null, ...high.via) }, [broad('child')], false],
    ['unexcepted grandchild', { child: derived('grandchild'), grandchild: high }, [broad('child')], false],
    ['shared diamond is not a cycle', { child: derived('left', 'right'), left: derived('leaf'), right: derived('leaf'), leaf: high }, ['child', 'left', 'right', 'leaf'].map((name) => scoped(name)), true],
    ['matching leaf cannot cover unrelated sibling', { child: derived('left', 'right'), left: high, right: wrong }, ['child', 'left', 'right'].map((name) => broad(name)), false],
    ['different child scope may not borrow parent approval', { child: high }, [scoped('child', [wrongId])], false],
    ['lower severity evidence is ignored', { child: derived({ severity: 'moderate' }, ...high.via) }, [broad('child')], true],
  ];
  for (const [name, others, exceptions, allowed] of cases) {
    await t.test(name, (subtest) => {
      const result = run(subtest, report({ example: derived('child'), ...others }), 1, [exception, ...exceptions]);
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

test('separate roots cannot share advisory approval regardless of traversal order', (t) => {
  const root = { severity: 'high', via: ['child'] };
  const other = { ...exception, packageName: 'other', advisories: ['GHSA-2222-2222-2222'] };
  const child = { ...exception, packageName: 'child', advisories: undefined };
  for (const roots of [{ example: root, other: root }, { other: root, example: root }]) {
    const result = run(t, report({ ...roots, child: high }), 1, [exception, other, child]);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /other: incomplete or out-of-scope advisory evidence/);
    assert.doesNotMatch(result.stdout, /Dependency audit contract OK/);
  }
});
