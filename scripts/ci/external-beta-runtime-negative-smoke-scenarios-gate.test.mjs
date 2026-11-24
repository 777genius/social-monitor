import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import '../lib/external-beta-runtime-negative-smoke-scenarios.test.mjs';

const sources = {
  checker: readFileSync(new URL('../check-external-beta-evidence-runner.mjs', import.meta.url), 'utf8'),
  durable: readFileSync(new URL('../lib/external-beta-durable-runtime-artifact-smokes.mjs', import.meta.url), 'utf8'),
};
const cases = [
  ['durable', 'validateRunnerNegativeDurableRuntimeArtifactSmokes', 'durableRuntimeNegativeSmokeScenarios'],
  ['checker', 'validateRunnerNegativeStagingReliabilityArtifactSmokes', 'stagingReliabilityNegativeSmokeScenarios'],
];

function activeSource(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function assertDurableBinding(source) {
  const root = ts.createSourceFile('checker.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(root.parseDiagnostics.length, 0);
  const factory = 'createExternalBetaDurableRuntimeArtifactSmokes';
  const imports = root.statements.filter(node => ts.isImportDeclaration(node)
    && node.moduleSpecifier.text === './lib/external-beta-durable-runtime-artifact-smokes.mjs');
  assert.equal(imports.length, 1);
  assert.deepStrictEqual(imports[0].importClause.namedBindings.elements.map(node => node.getText(root)), [factory]);
  const declarations = root.statements.filter(ts.isVariableStatement)
    .flatMap(node => [...node.declarationList.declarations]);
  const bindings = declarations.filter(node => node.initializer && ts.isCallExpression(node.initializer)
    && node.initializer.expression.getText(root) === factory);
  assert.equal(bindings.length, 1, 'durable artifact smokes must bind once at top level');
  const binding = bindings[0];
  assert.ok(ts.isObjectBindingPattern(binding.name));
  const validators = ['validateRunnerPositiveDurableRuntimeArtifactSmoke', 'validateRunnerNegativeDurableRuntimeArtifactSmokes'];
  assert.deepStrictEqual(binding.name.elements.map(node => node.getText(root)), validators);
  assert.equal(binding.initializer.arguments.length, 1);
  const dependencies = binding.initializer.arguments[0];
  assert.ok(ts.isObjectLiteralExpression(dependencies));
  assert.equal(dependencies.properties.filter(node => ts.isShorthandPropertyAssignment(node)
    && node.name.text === 'durableRuntimeNegativeSmokeScenarios').length, 1);
  for (const validator of validators) {
    const invocations = root.statements.filter(node => ts.isExpressionStatement(node)
      && ts.isCallExpression(node.expression) && node.expression.expression.getText(root) === validator);
    assert.equal(invocations.length, 1, validator + ' must run at top level');
    assert.ok(invocations[0].pos > binding.end, validator + ' must run after binding');
  }
  return binding.parent.parent.getText(root);
}

function assertDelegated(candidate) {
  assert.match(activeSource(candidate.checker), /from '\.\/lib\/external-beta-runtime-negative-smoke-scenarios\.mjs'/);
  assertDurableBinding(candidate.checker);
  for (const [owner, caller, factory] of cases) {
    const active = activeSource(candidate[owner]);
    const marker = `function ${caller}() {\n`;
    const start = active.indexOf(marker);
    assert.ok(start >= 0, caller);
    const body = active.slice(start + marker.length);
    const loopStart = body.search(/^[ \t]*for \(const scenario of scenarios\) \{$/m);
    assert.ok(loopStart > 0, caller);
    const setup = body.slice(0, loopStart);
    const statement = `const scenarios = ${factory}();`;
    assert.ok(setup.includes(statement), caller);
    const calls = [];
    const sentinel = [];
    const boundScenarios = runInNewContext(`${setup}\nscenarios`, {
      [factory]: () => { calls.push(factory); return sentinel; },
    }, { timeout: 1000 });
    assert.deepEqual(calls, [factory], caller);
    assert.strictEqual(boundScenarios, sentinel, caller);
  }
}
test('both original runtime negative smoke validators delegate to pure scenario factories', () => {
  assertDelegated(sources);
  for (const source of Object.values(sources)) {
    assert.doesNotMatch(source, /const scenarios = \[\n\s*\{\n\s*label: 'durable runtime fixture provenance'/);
    assert.doesNotMatch(source, /const scenarios = \[\n\s*\{\n\s*label: 'staging reliability fixture provenance'/);
  }
});
test('deleted or commented runtime scenario call fails closed', () => {
  for (const [owner, , factory] of cases) {
    const statement = `const scenarios = ${factory}();`;
    assert.ok(sources[owner].includes(statement));
    assert.throws(() => assertDelegated({ ...sources, [owner]: sources[owner].replace(statement, '') }), { code: 'ERR_ASSERTION' });
    assert.throws(() => assertDelegated({ ...sources, [owner]: sources[owner].replace(statement, '// ' + statement) }), { code: 'ERR_ASSERTION' });
  }
});
test('unreachable runtime scenario call cannot satisfy behavioral delegation', () => {
  for (const [owner, , factory] of cases) {
    const statement = `const scenarios = ${factory}();`;
    assert.throws(() => assertDelegated({ ...sources, [owner]: sources[owner].replace(statement, `if (false) { ${statement} }`) }), { name: 'ReferenceError', message: 'scenarios is not defined' });
  }
});
test('nested scenario factory call cannot replace the loop-bound result', () => {
  for (const [owner, , factory] of cases) {
    const statement = `const scenarios = ${factory}();`;
    assert.throws(() => assertDelegated({ ...sources, [owner]: sources[owner].replace(statement, `{ ${statement} }\n  const scenarios = [];`) }), { code: 'ERR_ASSERTION' });
  }
});

test('extracted durable validator binding cannot be dead, renamed or disconnected from its scenarios', () => {
  const binding = assertDurableBinding(sources.checker);
  for (const checker of [
    sources.checker.replace(binding, '/* ' + binding + ' */'),
    sources.checker.replace(binding, 'function dormantSmokes() {\n' + binding + '\n}'),
    sources.checker.replace('./lib/external-beta-durable-runtime-artifact-smokes.mjs', './lib/wrong-owner.mjs'),
    sources.checker.replace(binding, binding.replace('durableRuntimeNegativeSmokeScenarios,', 'durableRuntimeNegativeSmokeScenarios: () => [],')),
    sources.checker.replace('validateRunnerNegativeDurableRuntimeArtifactSmokes();', '// removed durable negative smoke invocation'),
  ]) {
    assert.throws(() => assertDelegated({ ...sources, checker }), { code: 'ERR_ASSERTION' });
  }
});
