import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import '../lib/external-beta-output-safety-smokes.test.mjs';

const checker = readFileSync(new URL('../check-external-beta-evidence-runner.mjs', import.meta.url), 'utf8');

function assertActiveDelegation(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  assert.match(code, /import\s*\{\s*createExternalBetaOutputSafetySmokes\s*\}\s*from\s*'\.\/lib\/external-beta-output-safety-smokes\.mjs'/);
  assert.match(code, /const\s*\{\s*validateRunnerOutputRedactionSmoke,\s*validateRunnerEnvFileSmokes\s*\}\s*=\s*createExternalBetaOutputSafetySmokes\s*\(\s*\{/);
  assert.match(code, /^[ \t]*validateRunnerOutputRedactionSmoke\(\);[ \t]*$/m);
  assert.match(code, /^[ \t]*validateRunnerEnvFileSmokes\(\);[ \t]*$/m);
  assert.doesNotMatch(code, /function\s+validateRunnerOutputRedactionSmoke\s*\(/);
  assert.doesNotMatch(code, /function\s+validateRunnerEnvFileSmokes\s*\(/);
}

test('original checker imports and executes both output security smoke validators', () => {
  assertActiveDelegation(checker);
});

test('delegation gate rejects disabled or removed redaction and env-file calls', () => {
  for (const name of ['validateRunnerOutputRedactionSmoke', 'validateRunnerEnvFileSmokes']) {
    assert.throws(() => assertActiveDelegation(checker.replace(name + '();', '')));
    assert.throws(() => assertActiveDelegation(checker.replace(name + '();', '// ' + name + '();')));
    assert.throws(() => assertActiveDelegation(checker.replace(name + '();', `const fakeCall = "${name}();";`)));
    assert.throws(() => assertActiveDelegation(checker.replace(name + '();', `if (false) { ${name}(); }`)));
  }
});

test('delegation gate rejects removed factory import and binding', () => {
  assert.throws(() => assertActiveDelegation(checker.replace("import { createExternalBetaOutputSafetySmokes } from './lib/external-beta-output-safety-smokes.mjs';", '')));
  assert.throws(() => assertActiveDelegation(checker.replace('= createExternalBetaOutputSafetySmokes({', '= null; //')));
});
