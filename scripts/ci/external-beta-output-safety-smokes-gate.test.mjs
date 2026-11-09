import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
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
  // Require direct executable top-level statements; line-oriented regexes alone
  // accept calls hidden inside unreachable blocks or nested functions.
  const parsed = ts.createSourceFile('check-external-beta-evidence-runner.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(parsed.parseDiagnostics.length, 0, 'original checker must parse as JavaScript');
  const directCalls = parsed.statements
    .filter((statement) => ts.isExpressionStatement(statement)
      && ts.isCallExpression(statement.expression)
      && ts.isIdentifier(statement.expression.expression)
      && statement.expression.arguments.length === 0)
    .map((statement) => statement.expression.expression.text);
  for (const name of ['validateRunnerOutputRedactionSmoke', 'validateRunnerEnvFileSmokes']) {
    assert.equal(directCalls.filter((value) => value === name).length, 1,
      `${name} must run exactly once as a direct top-level statement`);
  }
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
    assert.throws(() => assertActiveDelegation(checker.replace(name + '();', `if (false) {\n  ${name}();\n}`)));
    assert.throws(() => assertActiveDelegation(checker.replace(name + '();', `function dormant() {\n  ${name}();\n}`)));
    assert.throws(() => assertActiveDelegation(checker.replace(name + '();', `false && ${name}();`)));
  }
});

test('delegation gate rejects removed factory import and binding', () => {
  assert.throws(() => assertActiveDelegation(checker.replace("import { createExternalBetaOutputSafetySmokes } from './lib/external-beta-output-safety-smokes.mjs';", '')));
  assert.throws(() => assertActiveDelegation(checker.replace('= createExternalBetaOutputSafetySmokes({', '= null; //')));
});
