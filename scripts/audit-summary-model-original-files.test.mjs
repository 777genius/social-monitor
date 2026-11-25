import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('original-position evidence cannot reuse a specialist occurrence across slices', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'summary-original-audit-'));
  try {
    const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    const dir = join(cwd, 'libs/summary/adapters/model');
    const docs = join(cwd, 'docs/iterations');
    const stem = '2026-11-08-summary-model-adapters-10k';
    mkdirSync(dir, { recursive: true });
    mkdirSync(docs, { recursive: true });
    git('init', '-q');
    const inventory = ['## File-level baseline'];
    for (let i = 0; i < 84; i += 1) {
      const file = `original-${i}.ts`;
      const count = i < 30 ? 183 : 182;
      const statements = i === 0 ? 2 : i === 1 ? 1 : 0;
      writeFileSync(join(dir, file), 'recordSignal();\n'.repeat(statements) + '// fixture\n'.repeat(count - statements));
      inventory.push(`| \`${file}\` | ${count} |`);
    }
    git('add', '.');
    git('-c', 'user.name=Audit Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Fixture baseline');
    const baseline = git('rev-parse', 'HEAD');
    // Only the isolated copy is rebound to the disposable fixture baseline.
    const source = readFileSync(new URL('./audit-summary-model-original-files.mjs', import.meta.url), 'utf8');
    const fixtureSource = source.replace(/const baseline = "[a-f0-9]{40}";/u, `const baseline = "${baseline}";`);
    assert.notEqual(fixtureSource, source);
    const auditor = join(cwd, 'audit.mjs');
    writeFileSync(auditor, fixtureSource);
    writeFileSync(join(docs, `${stem}-inventory.md`), inventory.join('\n') + '\n');
    writeFileSync(join(dir, 'original-0.ts'), '// moved\n');
    writeFileSync(join(dir, 'original-1.ts'), '// moved\n');
    const slice = (original, owner, position) => ({ original, owner, originalPositions: [position], responsibility: 'Fixture responsibility' });
    const a = slice('original-0.ts', 'specialist.ts', 1);
    const b = slice('original-0.ts', 'specialist.ts', 2);
    const c = slice('original-1.ts', 'specialist.ts', 1);
    const run = (slices, occurrences) => {
      writeFileSync(join(dir, 'specialist.ts'), 'recordSignal();\n'.repeat(occurrences));
      writeFileSync(join(docs, `${stem}-positions.json`), JSON.stringify({ schemaVersion: 1, baseline, slices }));
      git('add', '.');
      git('-c', 'user.name=Audit Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'Fixture candidate');
      return spawnSync(process.execPath, [auditor], { cwd, encoding: 'utf8' });
    };
    const valid = run([a, b, c], 2);
    assert.equal(valid.status, 0, valid.stderr);
    assert.match(valid.stdout, /subset: 3 across 3 slices/u);
    const crossOriginal = run([a, c], 1);
    assert.equal(crossOriginal.status, 0, crossOriginal.stderr);
    assert.match(crossOriginal.stdout, /subset: 2 across 2 slices/u);
    const reused = run([a, c, b], 1);
    assert.notEqual(reused.status, 0, 'distinct slices must not reuse a single specialist line');
    assert.match(reused.stderr, /original position absent from specialist owner: .*original-0\.ts:2/u);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
