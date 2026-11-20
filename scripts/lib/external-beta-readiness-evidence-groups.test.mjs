import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
import { validateExternalBetaEvidenceGroups } from './external-beta-readiness-evidence-groups.mjs';

const ids = [
  'release-baseline-freeze', 'durable-runtime-proof', 'production-auth-finalization',
  'source-provider-live-certification', 'credential-secret-runtime-flow',
  'rabbitmq-staging-reliability-drill', 'postgres-restore-migration-drill',
  'durable-backend-e2e-loop', 'summary-quality-feedback-hardening',
  'operational-support-package', 'capacity-envelope-beta-ring-decision',
  'release-artifact-evidence', 'security-final-sweep', 'no-go-cleanup',
];

function fixture(decision = 'hold') {
  const contract = {
    externalBetaDecision: decision,
    requiredEvidenceGroups: ids.map((groupId) => ({
      groupId, status: 'passed', owner: 'owner', blocksExternalBeta: true,
      verificationCommands: ['npm run check:fixture'],
      requiredArtifacts: ['existing'], exitCondition: 'done',
    })),
  };
  const violations = [];
  const run = () => validateExternalBetaEvidenceGroups({
    contract, scripts: { 'check:fixture': 'node fixture.mjs' },
    existsSync: (path) => path === 'existing',
    contractPath: 'readiness.json', violations,
  });
  return { contract, violations, run };
}

test('all required groups passed allow hold and go', () => {
  for (const decision of ['hold', 'go']) {
    const x = fixture(decision);
    x.run();
    assert.deepStrictEqual(x.violations, []);
  }
});

test('pending evidence blocks go but preserves hold', () => {
  const x = fixture('go');
  x.contract.requiredEvidenceGroups[0].status = 'hold';
  x.run();
  assert.deepStrictEqual(x.violations, [
    'readiness.json: externalBetaDecision cannot be go while blocking evidence is not passed',
  ]);
  const y = fixture('hold');
  y.contract.requiredEvidenceGroups[0].status = 'hold';
  y.run();
  assert.deepStrictEqual(y.violations, []);
});

test('duplicate, unsupported and missing groups retain diagnostic sequence', () => {
  const x = fixture();
  const removed = x.contract.requiredEvidenceGroups.pop().groupId;
  x.contract.requiredEvidenceGroups.push({ ...x.contract.requiredEvidenceGroups[0] });
  x.contract.requiredEvidenceGroups.push({ ...x.contract.requiredEvidenceGroups[0], groupId: 'unexpected' });
  x.run();
  assert.deepStrictEqual(x.violations, [
    'readiness.json: duplicate evidence group "release-baseline-freeze"',
    'readiness.json: unsupported evidence group "unexpected"',
    'readiness.json: missing required evidence group "' + removed + '"',
  ]);
});

test('malformed group checks keep original diagnostic order', () => {
  const x = fixture();
  Object.assign(x.contract.requiredEvidenceGroups[0], {
    status: 'invalid', owner: ' ', blocksExternalBeta: false,
    verificationCommands: ['npm run missing'], requiredArtifacts: ['absent'],
    exitCondition: '',
  });
  x.run();
  assert.deepStrictEqual(x.violations, [
    'readiness.json: evidence group "release-baseline-freeze" has unsupported status "invalid"',
    'readiness.json: evidence group "release-baseline-freeze" must define owner',
    'readiness.json: evidence group "release-baseline-freeze" must block external beta until passed',
    'readiness.json: evidence group "release-baseline-freeze" references missing script "missing"',
    'readiness.json: evidence group "release-baseline-freeze" references missing artifact "absent"',
    'readiness.json: evidence group "release-baseline-freeze" must define exitCondition',
  ]);
});

test('missing group collection emits required group violations in original order', () => {
  const x = fixture('go');
  delete x.contract.requiredEvidenceGroups;
  x.run();
  assert.deepStrictEqual(x.violations, ids.map((id) =>
    'readiness.json: missing required evidence group "' + id + '"'));
});

const DELEGATE = 'validateExternalBetaEvidenceGroups';
const DEPS = ['contract', 'scripts', 'existsSync', 'contractPath', 'violations'];
const IMPORT_PATH = './lib/external-beta-readiness-evidence-groups.mjs';

// An imported name or text marker is not proof of a live delegation. Verify that
// the actual top-level call passes dependencies bound earlier in this runner.
function inspectReadinessRunner(source) {
  const tree = ts.createSourceFile('check-external-beta-readiness.mjs', source,
    ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let imports = 0;
  const liveBindings = new Set();
  const calls = [];
  for (const statement of tree.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) &&
      ts.isNamedImports(statement.importClause?.namedBindings)) {
      const names = statement.importClause.namedBindings.elements;
      if (statement.moduleSpecifier.text === IMPORT_PATH) {
        imports += names.filter(element => !element.propertyName && element.name.text === DELEGATE).length;
      }
      if (statement.moduleSpecifier.text === 'node:fs') {
        for (const element of names) {
          if (!element.propertyName) liveBindings.add(element.name.text);
        }
      }
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          liveBindings.add(declaration.name.text);
        }
      }
    }
    if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) &&
      ts.isIdentifier(statement.expression.expression) && statement.expression.expression.text === DELEGATE) {
      const call = statement.expression;
      const properties = call.arguments.length === 1 && ts.isObjectLiteralExpression(call.arguments[0])
        ? call.arguments[0].properties : [];
      const names = properties.filter(ts.isShorthandPropertyAssignment).map(property => property.name.text);
      calls.push({ valid: properties.length === DEPS.length && names.length === DEPS.length &&
        DEPS.every(name => names.includes(name) && liveBindings.has(name)) });
    }
  }
  return imports === 1 && calls.length === 1 && calls[0].valid;
}

test('runner actually delegates once at module level with live evidence dependencies', () => {
  const source = readFileSync(new URL('../check-external-beta-readiness.mjs', import.meta.url), 'utf8');
  assert.equal(inspectReadinessRunner(source), true);
});

test('comments, dead functions and omitted dependencies cannot fake delegation', () => {
  const source = readFileSync(new URL('../check-external-beta-readiness.mjs', import.meta.url), 'utf8');
  const call = 'validateExternalBetaEvidenceGroups({ contract, scripts, existsSync, contractPath, violations });';
  assert.ok(source.includes(call), 'test mutation must target the actual runner call');
  const variants = [
    source.replace(call, '// ' + call),
    source.replace(call, 'function neverInvoked() { ' + call + ' }'),
    source.replace(call,
      'validateExternalBetaEvidenceGroups({ contract, /* scripts, */ existsSync, contractPath, violations });'),
    source.replace(IMPORT_PATH, './lib/unrelated-readiness-policy.mjs'),
  ];
  for (const variant of variants) {
    assert.notEqual(variant, source, 'mutation must change the real source');
    assert.equal(inspectReadinessRunner(variant), false, 'fake delegation must be rejected');
  }
});
