import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
import {
  createExternalBetaNegativeSmokeRuntime,
  childProcessErrorOutput,
  smokeOutputSnippet,
} from './external-beta-negative-smoke-runtime.mjs';

test('negative smoke selection preserves live strict/representative membership', () => {
  const strict = new Set(['a', 'b']);
  const representative = new Set(['a']);
  const { negativeSmokeOptions, shouldRunNegativeSmoke } = createExternalBetaNegativeSmokeRuntime({
    strictSemanticNegativeSmokeLabels: strict,
    representativeSemanticNegativeSmokeLabels: representative,
  });
  assert.deepEqual(negativeSmokeOptions('plain'), { contractSmokeArtifactOnly: true });
  assert.deepEqual(negativeSmokeOptions('a'), { contractSmokeArtifactOnly: false });
  assert.equal(shouldRunNegativeSmoke('plain'), true);
  assert.equal(shouldRunNegativeSmoke('a'), true);
  assert.equal(shouldRunNegativeSmoke('b'), false);
  representative.add('b');
  assert.equal(shouldRunNegativeSmoke('b'), true);
  strict.delete('b');
  assert.deepEqual(negativeSmokeOptions('b'), { contractSmokeArtifactOnly: true });
});

test('error diagnostics preserve Buffer decoding, order, and empty filtering', () => {
  const error = { stdout: Buffer.from('out'), stderr: ' err ',
    output: [null, Buffer.from('tail'), '', undefined], message: 'message' };
  assert.equal(childProcessErrorOutput(error), 'out\n err \ntail\nmessage');
  assert.equal(childProcessErrorOutput({ message: '' }), '');
  assert.equal(childProcessErrorOutput({ message: 0, output: [] }), '0');
});

test('smoke snippet preserves trimmed last eight nonblank lines', () => {
  assert.equal(smokeOutputSnippet('  first  \n\n second \n '), 'first | second');
  assert.equal(smokeOutputSnippet(Array.from({ length: 10 }, (_, i) => ' ' + i + ' ').join('\n')),
    '2 | 3 | 4 | 5 | 6 | 7 | 8 | 9');
  assert.equal(smokeOutputSnippet(null), 'null');
});

const EXTRACTED_IMPORTS = [
  'createExternalBetaNegativeSmokeRuntime', 'childProcessErrorOutput', 'smokeOutputSnippet',
];

function inspectRunnerWiring(source) {
  const tree = ts.createSourceFile('check-external-beta-evidence-runner.mjs', source,
    ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const imports = new Set();
  const calls = new Set();
  const provided = new Set();
  const declared = new Set();
  let factoryBound = false;
  for (const statement of tree.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== './lib/external-beta-negative-smoke-runtime.mjs' ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)) continue;
    for (const element of statement.importClause.namedBindings.elements) {
      if (!element.propertyName) imports.add(element.name.text);
    }
  }
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) calls.add(node.expression.text);
    if (ts.isShorthandPropertyAssignment(node)) provided.add(node.name.text);
    if (ts.isFunctionDeclaration(node) && node.name) declared.add(node.name.text);
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) &&
      node.initializer && ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === 'createExternalBetaNegativeSmokeRuntime' &&
      node.initializer.arguments.length === 1 &&
      ts.isObjectLiteralExpression(node.initializer.arguments[0])) {
      const bindings = new Set(node.name.elements.filter((element) => !element.propertyName)
        .map((element) => element.name.getText(tree)));
      const dependencies = new Set(node.initializer.arguments[0].properties
        .filter(ts.isShorthandPropertyAssignment).map((property) => property.name.text));
      factoryBound = ['negativeSmokeOptions', 'shouldRunNegativeSmoke'].every(
        (name) => bindings.has(name)) &&
        ['strictSemanticNegativeSmokeLabels', 'representativeSemanticNegativeSmokeLabels'].every(
          (name) => dependencies.has(name));
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return { imports, calls, provided, declared, factoryBound };
}

test('runner delegates real imported functions, live bindings and diagnostic consumers', () => {
  const source = readFileSync(new URL('../check-external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
  const wiring = inspectRunnerWiring(source);
  for (const name of EXTRACTED_IMPORTS) {
    assert.ok(wiring.imports.has(name), name + ' must import the extracted owner');
  }
  assert.ok(wiring.factoryBound, 'runner must bind the two helpers to the live Set dependencies');
  for (const name of ['negativeSmokeOptions', 'shouldRunNegativeSmoke', 'smokeOutputSnippet']) {
    assert.ok(wiring.calls.has(name), name + ' must be invoked, not mentioned in a comment');
  }
  assert.ok(wiring.provided.has('childProcessErrorOutput'),
    'runner must inject its error normalizer into downstream smoke factories');
  for (const name of ['negativeSmokeOptions', 'shouldRunNegativeSmoke',
    'childProcessErrorOutput', 'smokeOutputSnippet']) {
    assert.ok(!wiring.declared.has(name), name + ' must not be locally redefined');
  }
  const scripts = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).scripts;
  for (const command of ['check:architecture', 'check:external-beta-evidence-runner']) {
    assert.match(scripts[command], /scripts\/lib\/external-beta-negative-smoke-runtime\.test\.mjs/);
  }
});

test('comment-only factory call and wrong import owner cannot satisfy wiring', () => {
  const source = readFileSync(new URL('../check-external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
  const commentedCall = source.replace(
    'createExternalBetaNegativeSmokeRuntime({',
    'unrelated(/* createExternalBetaNegativeSmokeRuntime({ */ {',
  );
  assert.notEqual(commentedCall, source, 'mutation must change the real factory call');
  assert.ok(commentedCall.includes('createExternalBetaNegativeSmokeRuntime('),
    'the old string guard would still accept the comment-only marker');
  assert.equal(inspectRunnerWiring(commentedCall).factoryBound, false);
  const wrongOwner = source.replace(
    "from './lib/external-beta-negative-smoke-runtime.mjs';",
    "from './lib/unrelated-negative-smoke-runtime.mjs';",
  );
  assert.notEqual(wrongOwner, source, 'mutation must replace the real import path');
  assert.equal(inspectRunnerWiring(wrongOwner).imports.has('childProcessErrorOutput'), false);
});
