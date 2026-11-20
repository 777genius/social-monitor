import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
import { validateExternalBetaCapacityAndExceptions } from './external-beta-readiness-capacity-no-go-policy.mjs';

const FIELDS = [
  'maxUsers',
  'maxTopicsPerWorkspace',
  'maxEnabledSourcesPerTopic',
  'maxManualScansPerWorkspacePerHour',
  'maxSummaryRequestsPerWorkspacePerHour',
  'maxQueueLagSeconds',
  'maxSummaryEstimatedCostUsdPerWorkspacePerDay',
  'maxDeliveryAttemptsPerWorkspacePerHour',
];

function fixture() {
  const contract = {
    capacityEnvelope: Object.fromEntries(FIELDS.map(field => [field, 1])),
    noGoExceptions: [{ exceptionId: 'hold-1', blocking: true, owner: 'owner', exitCondition: 'done' }],
  };
  const violations = [];
  const run = () => validateExternalBetaCapacityAndExceptions({ contract, contractPath: 'readiness.json', violations });
  return { contract, violations, run };
}

test('valid positive numeric capacity and blocking exceptions retain a clean contract', () => {
  const x = fixture();
  x.contract.capacityEnvelope.maxUsers = 0.001;
  x.run();
  assert.deepStrictEqual(x.violations, []);
});

test('missing capacity envelope preserves every required numeric diagnostic in order', () => {
  const x = fixture();
  delete x.contract.capacityEnvelope;
  x.run();
  assert.deepStrictEqual(x.violations, FIELDS.map(field =>
    `readiness.json: capacityEnvelope.${field} must be positive`));
});

test('zero, negative, string, NaN, Infinity and undefined are rejected as originally', () => {
  const x = fixture();
  const invalid = [0, -1, '1', NaN, Infinity, undefined];
  for (let i = 0; i < invalid.length; i++) x.contract.capacityEnvelope[FIELDS[i]] = invalid[i];
  x.run();
  assert.deepStrictEqual(x.violations, FIELDS.slice(0, invalid.length).map(field =>
    `readiness.json: capacityEnvelope.${field} must be positive`));
});

test('no-go exceptions preserve blocking and required-field diagnostic order', () => {
  const x = fixture();
  x.contract.noGoExceptions = [
    { exceptionId: 'hold-1', blocking: false, owner: '', exitCondition: null },
    { exceptionId: '', blocking: false, owner: 'owner', exitCondition: 'done' },
  ];
  x.run();
  assert.deepStrictEqual(x.violations, [
    'readiness.json: noGoException "hold-1" must be blocking',
    'readiness.json: noGoException must define owner',
    'readiness.json: noGoException must define exitCondition',
    'readiness.json: noGoException "" must be blocking',
    'readiness.json: noGoException must define exceptionId',
  ]);
});

test('missing no-go exception collection is accepted without mutating inputs', () => {
  const x = fixture();
  delete x.contract.noGoExceptions;
  const envelopeBefore = { ...x.contract.capacityEnvelope };
  x.run();
  assert.deepStrictEqual(x.violations, []);
  assert.deepStrictEqual(x.contract.capacityEnvelope, envelopeBefore);
});

test('capacity findings precede no-go findings even when both fail', () => {
  const x = fixture();
  x.contract.capacityEnvelope.maxUsers = 0;
  x.contract.noGoExceptions[0].blocking = false;
  x.run();
  assert.deepStrictEqual(x.violations, [
    'readiness.json: capacityEnvelope.maxUsers must be positive',
    'readiness.json: noGoException "hold-1" must be blocking',
  ]);
});

// Guard the production entrypoint, not just the extracted policy in isolation.
// A commented-out or dead-function call must not satisfy integration tests.
function hasLiveEntrypointDelegation(source) {
  const tree = ts.createSourceFile('check-external-beta-readiness.mjs', source,
    ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let imports = 0;
  let calls = 0;
  const live = new Set();
  for (const statement of tree.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === './lib/external-beta-readiness-capacity-no-go-policy.mjs' &&
      ts.isNamedImports(statement.importClause?.namedBindings)) {
      imports += statement.importClause.namedBindings.elements.filter(x =>
        !x.propertyName && x.name.text === 'validateExternalBetaCapacityAndExceptions').length;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) live.add(declaration.name.text);
      }
    }
    if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) &&
      ts.isIdentifier(statement.expression.expression) &&
      statement.expression.expression.text === 'validateExternalBetaCapacityAndExceptions') {
      const args = statement.expression.arguments;
      const properties = args.length === 1 && ts.isObjectLiteralExpression(args[0]) ? args[0].properties : [];
      const names = properties.filter(ts.isShorthandPropertyAssignment).map(x => x.name.text);
      if (names.length === 3 && properties.length === 3 &&
        ['contract', 'contractPath', 'violations'].every(name => names.includes(name) && live.has(name))) {
        calls += 1;
      }
    }
  }
  return imports === 1 && calls === 1;
}

test('the real readiness runner delegates to the specialized owner at module scope', () => {
  const source = readFileSync(new URL('../check-external-beta-readiness.mjs', import.meta.url), 'utf8');
  assert.equal(hasLiveEntrypointDelegation(source), true);
  const call = 'validateExternalBetaCapacityAndExceptions({ contract, contractPath, violations });';
  assert.ok(source.includes(call));
  const mutated = [
    source.replace(call, '// ' + call),
    source.replace(call, 'function unused() { ' + call + ' }'),
    source.replace(call, 'validateExternalBetaCapacityAndExceptions({ contract, /* contractPath, */ violations });'),
    source.replace('./lib/external-beta-readiness-capacity-no-go-policy.mjs', './lib/unrelated-policy.mjs'),
  ];
  for (const m of mutated) {
    assert.notEqual(m, source);
    assert.equal(hasLiveEntrypointDelegation(m), false);
  }
});
