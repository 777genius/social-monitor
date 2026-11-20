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

// Verify each actual downstream factory receives diagnostics, rather than
// accepting a same-named shorthand from any unrelated object in the runner.
const DIAGNOSTIC_FACTORY_INJECTIONS = new Map([
  ['createExternalBetaArtifactValidationSmokes', ['childProcessErrorOutput']],
  ['createExternalBetaRuntimePlanSmokes', ['childProcessErrorOutput', 'smokeOutputSnippet']],
  ['createExternalBetaPreflightCommandSmokes', ['childProcessErrorOutput', 'smokeOutputSnippet']],
  ['createExternalBetaOutputSafetySmokes', ['childProcessErrorOutput', 'smokeOutputSnippet']],
]);

function inspectRunnerWiring(source) {
  const tree = ts.createSourceFile('check-external-beta-evidence-runner.mjs', source,
    ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const imports = new Set();
  const calls = new Set();
  const diagnosticInjections = new Map();
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
  for (const statement of tree.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const call = declaration.initializer;
      if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression) ||
        !DIAGNOSTIC_FACTORY_INJECTIONS.has(call.expression.text) ||
        call.arguments.length !== 1 || !ts.isObjectLiteralExpression(call.arguments[0])) continue;
      diagnosticInjections.set(call.expression.text, new Set(call.arguments[0].properties
        .filter(ts.isShorthandPropertyAssignment).map(property => property.name.text)));
    }
  }
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) calls.add(node.expression.text);
    if (ts.isFunctionDeclaration(node) && node.name) declared.add(node.name.text);
    if (ts.isVariableDeclaration(node) && node.parent?.parent?.parent === tree &&
      ts.isObjectBindingPattern(node.name) &&
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
  return { imports, calls, diagnosticInjections, declared, factoryBound };
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
  for (const [factory, dependencies] of DIAGNOSTIC_FACTORY_INJECTIONS) {
    for (const dependency of dependencies) {
      assert.ok(wiring.diagnosticInjections.get(factory)?.has(dependency),
        factory + ' must receive live ' + dependency + ' injection');
    }
  }
  for (const name of ['negativeSmokeOptions', 'shouldRunNegativeSmoke',
    'childProcessErrorOutput', 'smokeOutputSnippet']) {
    assert.ok(!wiring.declared.has(name), name + ' must not be locally redefined');
  }
  const scripts = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).scripts;
  for (const command of ['check:architecture', 'check:external-beta-evidence-runner']) {
    assert.match(scripts[command], /scripts\/lib\/external-beta-negative-smoke-runtime\.test\.mjs/);
  }
});

test('a diagnostic omitted from one smoke factory cannot hide behind other injections', () => {
  const source = readFileSync(new URL('../check-external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
  const missing = source.replace(
    '  releaseDeploySmokeImageDigest,\n  childProcessErrorOutput,\n});',
    '  releaseDeploySmokeImageDigest,\n  // childProcessErrorOutput,\n});',
  );
  assert.notEqual(missing, source, 'mutation must remove one real factory injection');
  assert.ok(missing.includes('  // childProcessErrorOutput,'),
    'diagnostic name remains in a comment, while other legitimate factories still inject it');
  const wiring = inspectRunnerWiring(missing);
  assert.equal(wiring.diagnosticInjections.get('createExternalBetaArtifactValidationSmokes')
    ?.has('childProcessErrorOutput'), false,
  'artifact factory must not pass from a comment or another factory');
  assert.equal(wiring.diagnosticInjections.get('createExternalBetaRuntimePlanSmokes')
    ?.has('childProcessErrorOutput'), true, 'independent runtime factory remains wired');
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
  const originalFactoryBinding = [
    'const { negativeSmokeOptions, shouldRunNegativeSmoke } = createExternalBetaNegativeSmokeRuntime({',
    '  strictSemanticNegativeSmokeLabels, representativeSemanticNegativeSmokeLabels,',
    '});',
  ].join('\n');
  const deadFactory = source.replace(
    originalFactoryBinding,
    ['function neverInvokedFactory() {', originalFactoryBinding, '}'].join('\n'),
  );
  assert.notEqual(deadFactory, source, 'mutation must relocate the real factory');
  const deadWiring = inspectRunnerWiring(deadFactory);
  assert.ok(deadWiring.calls.has('shouldRunNegativeSmoke'),
    'old call-name guard still passes although top-level binding was removed');
  assert.equal(deadWiring.factoryBound, false,
    'factory binding in an uninvoked function must not pass E2E wiring');
  const wrongOwner = source.replace(
    "from './lib/external-beta-negative-smoke-runtime.mjs';",
    "from './lib/unrelated-negative-smoke-runtime.mjs';",
  );
  assert.notEqual(wrongOwner, source, 'mutation must replace the real import path');
  assert.equal(inspectRunnerWiring(wrongOwner).imports.has('childProcessErrorOutput'), false);
});
