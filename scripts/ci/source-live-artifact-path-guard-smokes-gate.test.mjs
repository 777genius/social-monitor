import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import '../lib/source-live-artifact-path-guard-smokes.test.mjs';

const checker = readFileSync(new URL('../check-source-live-certification-evidence.mjs', import.meta.url), 'utf8');

function assertLiveDelegation(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  assert.match(code, /import\s*\{\s*createSourceLiveArtifactPathGuardSmokes\s*\}\s*from\s*'\.\/lib\/source-live-artifact-path-guard-smokes\.mjs'/);
  assert.match(code, /const\s*\{\s*validateCaptureOutputPathGuards,\s*validateDirectRedditLifecyclePathGuards\s*\}\s*=\s*createSourceLiveArtifactPathGuardSmokes\s*\(/);
  assert.match(code, /import\s*\{\s*createSourceLiveSmokeScriptContracts\s*\}\s*from\s*'\.\/lib\/source-live-smoke-script-contracts\.mjs'/);
  assert.match(code, /^[ \t]*validateCaptureOutputPathGuards\(\);[ \t]*$/m);
  assert.match(code, /^[ \t]*validateDirectRedditLifecyclePathGuards\(\);[ \t]*$/m);
  assert.doesNotMatch(code, /\bfunction\s+validateCaptureOutputPathGuards\s*\(/);
  assert.doesNotMatch(code, /\bfunction\s+validateDirectRedditLifecyclePathGuards\s*\(/);
  // Regexes alone accept unreachable guard calls nested under `if (false)`.
  // The original checker must invoke both validators directly in its live smoke function.
  const parsed = ts.createSourceFile('check-source-live-certification-evidence.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(parsed.parseDiagnostics.length, 0, 'original checker must parse as JavaScript');
  const contractFactoryBindings = parsed.statements
    .filter((statement) => ts.isVariableStatement(statement))
    .flatMap((statement) => statement.declarationList.declarations)
    .filter((declaration) => ts.isObjectBindingPattern(declaration.name)
      && declaration.name.elements.some((element) => ts.isIdentifier(element.name)
        && element.name.text === 'validateLiveSmokeScriptContracts')
      && declaration.initializer && ts.isCallExpression(declaration.initializer)
      && ts.isIdentifier(declaration.initializer.expression)
      && declaration.initializer.expression.text === 'createSourceLiveSmokeScriptContracts');
  assert.equal(contractFactoryBindings.length, 1,
    'checker must bind the extracted source-live contract factory exactly once at top level');
  const liveSmokeFunction = parsed.statements.find((statement) => ts.isFunctionDeclaration(statement)
    && statement.name?.text === 'validateLiveSmokeScripts');
  assert.ok(liveSmokeFunction?.body, 'original live-smoke function must exist');
  const rootCalls = parsed.statements
    .filter((statement) => ts.isExpressionStatement(statement)
      && ts.isCallExpression(statement.expression)
      && ts.isIdentifier(statement.expression.expression)
      && statement.expression.expression.text === 'validateLiveSmokeScripts'
      && statement.expression.arguments.length === 0);
  assert.equal(rootCalls.length, 1, 'original checker must invoke validateLiveSmokeScripts directly at top level');
  const directCalls = liveSmokeFunction.body.statements
    .filter((statement) => ts.isExpressionStatement(statement)
      && ts.isCallExpression(statement.expression)
      && ts.isIdentifier(statement.expression.expression)
      && statement.expression.arguments.length === 0)
    .map((statement) => statement.expression.expression.text);
  assert.deepEqual(
    directCalls.filter((name) => [
      'validateLiveSmokeScriptContracts',
      'validateCaptureOutputPathGuards',
      'validateDirectRedditLifecyclePathGuards',
    ].includes(name)),
    ['validateLiveSmokeScriptContracts', 'validateCaptureOutputPathGuards', 'validateDirectRedditLifecyclePathGuards'],
    'source-live contracts and both path guards must execute once, directly and in order',
  );
  for (const name of ['validateCaptureOutputPathGuards', 'validateDirectRedditLifecyclePathGuards']) {
    assert.equal(directCalls.filter((value) => value === name).length, 1,
      `${name} must run exactly once directly inside validateLiveSmokeScripts`);
  }
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
    assert.throws(() => assertLiveDelegation(checker.replace('  ' + name + '();', `  if (false) {\n    ${name}();\n  }`)));
    assert.throws(() => assertLiveDelegation(checker.replace('  ' + name + '();', `  function dormant() {\n    ${name}();\n  }`)));
    assert.throws(() => assertLiveDelegation(checker.replace('  ' + name + '();', `  false && ${name}();`)));
  }
});

test('disabled or nested main live-smoke invocation cannot pass the gate', () => {
  for (const replacement of [
    '',
    'if (false) {\n  validateLiveSmokeScripts();\n}',
    'function dormant() {\n  validateLiveSmokeScripts();\n}',
    'false && validateLiveSmokeScripts();',
  ]) {
    assert.throws(() => assertLiveDelegation(checker.replace('validateLiveSmokeScripts();', replacement)));
  }
});

test('missing factory import or binding fails closed', () => {
  assert.throws(() => assertLiveDelegation(checker.replace("import { createSourceLiveArtifactPathGuardSmokes } from './lib/source-live-artifact-path-guard-smokes.mjs';", '')));
  assert.throws(() => assertLiveDelegation(checker.replace('= createSourceLiveArtifactPathGuardSmokes({', '= null; //')));
});

test('removed, commented or unreachable source-live contract inspection fails closed', () => {
  const invocation = '  validateLiveSmokeScriptContracts();';
  assert.ok(checker.includes(invocation), 'active inspection invocation must exist before mutation');
  for (const replacement of [
    '',
    '  // validateLiveSmokeScriptContracts();',
    '  if (false) { validateLiveSmokeScriptContracts(); }',
    '  false && validateLiveSmokeScriptContracts();',
    '  function dormant() { validateLiveSmokeScriptContracts(); }',
  ]) {
    assert.throws(() => assertLiveDelegation(checker.replace(invocation, replacement)));
  }
});

test('missing source-live contract factory import or top-level initializer fails closed', () => {
  const imported = "import { createSourceLiveSmokeScriptContracts } from './lib/source-live-smoke-script-contracts.mjs';";
  const initializer = 'createSourceLiveSmokeScriptContracts({';
  assert.ok(checker.includes(imported));
  assert.ok(checker.includes(initializer));
  assert.throws(() => assertLiveDelegation(checker.replace(imported, '')));
  assert.throws(() => assertLiveDelegation(checker.replace(initializer, 'fakeSourceLiveSmokeFactory({')));
});
