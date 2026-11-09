import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import '../lib/source-live-artifact-path-guard-smokes.test.mjs';

const checker = readFileSync(new URL('../check-source-live-certification-evidence.mjs', import.meta.url), 'utf8');

function assertLiveDelegation(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  assert.match(code, /import\s*\{\s*createSourceLiveArtifactPathGuardSmokes\s*\}\s*from\s*'\.\/lib\/source-live-artifact-path-guard-smokes\.mjs'/);
  assert.match(code, /const\s*\{\s*validateCaptureOutputPathGuards,\s*validateDirectRedditLifecyclePathGuards\s*\}\s*=\s*createSourceLiveArtifactPathGuardSmokes\s*\(/);
  assert.match(code, /^[ \t]*validateCaptureOutputPathGuards\(\);[ \t]*$/m);
  assert.match(code, /^[ \t]*validateDirectRedditLifecyclePathGuards\(\);[ \t]*$/m);
  assert.doesNotMatch(code, /\bfunction\s+validateCaptureOutputPathGuards\s*\(/);
  assert.doesNotMatch(code, /\bfunction\s+validateDirectRedditLifecyclePathGuards\s*\(/);
}

test('source-live checker still invokes both original path guard smokes', () => {
  assertLiveDelegation(checker);
});

test('removing or disabling either source-live guard cannot pass the delegation gate', () => {
  for (const name of ['validateCaptureOutputPathGuards', 'validateDirectRedditLifecyclePathGuards']) {
    assert.throws(() => assertLiveDelegation(checker.replace('  ' + name + '();', '')));
    assert.throws(() => assertLiveDelegation(checker.replace('  ' + name + '();', '// ' + name + '();')));
    assert.throws(() => assertLiveDelegation(checker.replace('  ' + name + '();', '  const fake = "' + name + '();";')));
    assert.throws(() => assertLiveDelegation(checker.replace('  ' + name + '();', '  if (false) { ' + name + '(); }')));
  }
});

test('missing factory import or binding fails closed', () => {
  assert.throws(() => assertLiveDelegation(checker.replace("import { createSourceLiveArtifactPathGuardSmokes } from './lib/source-live-artifact-path-guard-smokes.mjs';", '')));
  assert.throws(() => assertLiveDelegation(checker.replace('= createSourceLiveArtifactPathGuardSmokes({', '= null; //')));
});
