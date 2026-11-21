import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { liveReadinessEntrypointBindings } from './external-beta-readiness-entrypoint-test-bindings.mjs';
import { validateExternalBetaGoCrossEvidence } from './external-beta-readiness-go-cross-evidence.mjs';

const ts = createRequire(import.meta.url)('typescript');
const name = 'validateExternalBetaGoCrossEvidence';
const path = './lib/external-beta-readiness-go-cross-evidence.mjs';
const deps = ['contract', 'sourceCertification', 'feedback', 'decision', 'contractPath', 'violations'];

function fixture(decisionValue = 'go') {
  const contract = { externalBetaDecision: decisionValue };
  const sourceCertification = { certifiedProviders: [{ liveBetaReady: true }] };
  const feedback = { evidenceMode: 'redacted_beta_samples' };
  const decision = { decision: 'go' };
  const violations = [];
  const run = () => validateExternalBetaGoCrossEvidence({
    contract, sourceCertification, feedback, decision, contractPath: 'readiness.json', violations,
  });
  return { contract, sourceCertification, feedback, decision, violations, run };
}

test('GO accepts complete live evidence without mutating inputs', () => {
  const x = fixture();
  const before = JSON.stringify([x.contract, x.sourceCertification, x.feedback, x.decision]);
  x.run();
  assert.deepStrictEqual(x.violations, []);
  assert.equal(JSON.stringify([x.contract, x.sourceCertification, x.feedback, x.decision]), before);
});

test('HOLD and REWORK retain original early exit, even with incomplete sources', () => {
  for (const status of ['hold', 'rework', 'unknown']) {
    const x = fixture(status);
    x.sourceCertification.certifiedProviders = null;
    x.feedback.evidenceMode = 'fixture';
    x.decision.decision = 'hold';
    assert.doesNotThrow(x.run);
    assert.deepStrictEqual(x.violations, []);
  }
});

test('GO retains provider, feedback, then beta-ring diagnostic order', () => {
  const x = fixture();
  x.sourceCertification.certifiedProviders.push({ liveBetaReady: false });
  x.feedback.evidenceMode = 'fixture';
  x.decision.decision = 'hold';
  x.run();
  assert.deepStrictEqual(x.violations, [
    'readiness.json: go requires every certified provider to be liveBetaReady',
    'readiness.json: go requires redacted beta feedback samples',
    'readiness.json: go requires beta ring decision to be go',
  ]);
});

test('GO preserves strict true provider readiness and preceding findings', () => {
  const x = fixture();
  x.sourceCertification.certifiedProviders = [{ liveBetaReady: 1 }, { liveBetaReady: true }];
  x.violations.push('earlier violation');
  x.run();
  assert.deepStrictEqual(x.violations, [
    'earlier violation', 'readiness.json: go requires every certified provider to be liveBetaReady',
  ]);
});

function inspectRunner(source) {
  const root = ts.createSourceFile('check-external-beta-readiness.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const live = liveReadinessEntrypointBindings(ts, root);
  if (!live) return false;
  let imports = 0;
  let calls = 0;
  for (const statement of root.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) &&
      ts.isNamedImports(statement.importClause?.namedBindings) && statement.moduleSpecifier.text === path) {
      imports += statement.importClause.namedBindings.elements.filter(x =>
        !x.propertyName && x.name.text === name).length;
    }
    if (ts.isVariableStatement(statement)) {
      for (const d of statement.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer) live.add(d.name.text);
      }
    }
    if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) &&
      ts.isIdentifier(statement.expression.expression) && statement.expression.expression.text === name) {
      const args = statement.expression.arguments;
      const props = args.length === 1 && ts.isObjectLiteralExpression(args[0]) ? args[0].properties : [];
      const names = props.filter(ts.isShorthandPropertyAssignment).map(p => p.name.text);
      if (props.length === deps.length && names.length === deps.length &&
        deps.every(dep => names.includes(dep) && live.has(dep))) calls++;
    }
  }
  return imports === 1 && calls === 1;
}

test('actual runner delegates GO evidence once at top level, not just text markers', () => {
  const source = readFileSync(new URL('../check-external-beta-readiness.mjs', import.meta.url), 'utf8');
  assert.equal(inspectRunner(source), true);
  const call = 'validateExternalBetaGoCrossEvidence({ contract, sourceCertification, feedback, decision, contractPath, violations });';
  assert.ok(source.includes(call), 'the structural mutation must target live runner code');
  for (const altered of [
    source.replace(call, '// ' + call),
    source.replace(call, 'function neverCalled() { ' + call + ' }'),
    source.replace(call, call.replace('sourceCertification, ', '')),
    source.replace(path, './lib/unrelated-policy.mjs'),
    source.replace('./lib/external-beta-readiness-input-snapshot.mjs', './lib/unrelated-snapshot.mjs'),
    source.replace('loadExternalBetaReadinessSnapshot(readFileSync)', 'loadExternalBetaReadinessSnapshot(() => "{}")'),
    source.replace('contractPath, packagePath, contract, sourceCertification', 'packagePath, contract, sourceCertification'),
  ]) {
    assert.notEqual(altered, source);
    assert.equal(inspectRunner(altered), false, 'fake delegation must fail');
  }
});
