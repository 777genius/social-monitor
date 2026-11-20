import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { validateExternalBetaContractAdmission } from './external-beta-readiness-contract-admission.mjs';

const ts = createRequire(import.meta.url)('typescript');
const fragments = [
  'durable runtime proof', 'live source provider certification',
  'credential and secret runtime flow', 'RabbitMQ and Postgres staging drills',
  'backend durable E2E loop', 'summary blocker feedback', 'security final sweep',
  'release artifact evidence', 'capacity envelope and no-go cleanup',
];
const fields = [
  'checkCommand', 'planCommand', 'jsonPlanCommand', 'summaryCommand',
  'preflightCommand', 'artifactValidationCommand',
  'dockerBundleImportCommand', 'currentPackageCommand',
];

function fixture() {
  const contract = {
    schemaVersion: 1, scope: 'backend-only',
    frontendPolicy: 'deferred_contract_only',
    evidenceMode: 'fixture_contract_with_external_evidence_required',
    externalBetaDecision: 'hold', goDecisionExitCriteria: fragments.slice(),
    evidenceRunner: {
      contract: 'existing',
      ...Object.fromEntries(fields.map(field => [field, 'npm run check:fixture'])),
    },
  };
  const scripts = { 'check:fixture': 'node fixture.mjs' };
  const violations = [];
  const run = () => validateExternalBetaContractAdmission({
    contract, contractPath: 'readiness.json', scripts,
    existsSync: path => path === 'existing', violations,
  });
  return { contract, scripts, violations, run };
}

test('valid hold, rework and go retain clean admission diagnostics', () => {
  for (const decision of ['hold', 'rework', 'go']) {
    const x = fixture();
    x.contract.externalBetaDecision = decision;
    x.run();
    assert.deepStrictEqual(x.violations, []);
  }
});

test('schema, policy, criteria and missing runner preserve exact original violation order', () => {
  const x = fixture();
  Object.assign(x.contract, {
    schemaVersion: 2, scope: 'full', frontendPolicy: 'ready',
    evidenceMode: 'live', externalBetaDecision: 'maybe',
    goDecisionExitCriteria: [], evidenceRunner: null,
  });
  x.run();
  assert.deepStrictEqual(x.violations, [
    'readiness.json: schemaVersion must be 1',
    'readiness.json: scope must be backend-only',
    'readiness.json: frontendPolicy must keep frontend deferred',
    'readiness.json: evidenceMode must remain fixture_contract_with_external_evidence_required until live evidence exists',
    'readiness.json: externalBetaDecision must be hold, go or rework',
    'readiness.json: goDecisionExitCriteria must list every blocking go prerequisite',
    'readiness.json: evidenceRunner is required',
  ]);
});

test('missing GO criteria fragments retain required ordering', () => {
  const x = fixture();
  x.contract.goDecisionExitCriteria = ['durable runtime proof'];
  x.run();
  assert.deepStrictEqual(x.violations, fragments.slice(1).map(fragment =>
    'readiness.json: goDecisionExitCriteria must include "' + fragment + '"'));
});

test('case insensitive GO fragments and --silent npm runner commands remain accepted', () => {
  const x = fixture();
  x.contract.goDecisionExitCriteria = fragments.map(fragment => fragment.toUpperCase());
  for (const field of fields) x.contract.evidenceRunner[field] = 'npm run --silent check:fixture --flag';
  x.run();
  assert.deepStrictEqual(x.violations, []);
});

test('missing runner contract and scripts retain exact ordered diagnostics', () => {
  const x = fixture();
  x.contract.evidenceRunner.contract = 'missing';
  x.contract.evidenceRunner.planCommand = 'node plan.mjs';
  x.contract.evidenceRunner.summaryCommand = 'npm run missing';
  delete x.contract.evidenceRunner.currentPackageCommand;
  x.run();
  assert.deepStrictEqual(x.violations, [
    'readiness.json: evidenceRunner.contract must reference an existing contract',
    'readiness.json: evidenceRunner.planCommand must reference an existing npm script',
    'readiness.json: evidenceRunner.summaryCommand must reference an existing npm script',
    'readiness.json: evidenceRunner.currentPackageCommand must reference an existing npm script',
  ]);
});

test('original admission policy never mutates input contracts or scripts', () => {
  const x = fixture();
  const contract = JSON.stringify(x.contract);
  const scripts = JSON.stringify(x.scripts);
  x.run();
  assert.strictEqual(JSON.stringify(x.contract), contract);
  assert.strictEqual(JSON.stringify(x.scripts), scripts);
  assert.deepStrictEqual(x.violations, []);
});

// Guard actual module-scope delegation, not a comment or dead nested factory.
function inspectEntrypoint(source) {
  const root = ts.createSourceFile('check-external-beta-readiness.mjs',
    source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const required = ['contract', 'contractPath', 'scripts', 'existsSync', 'violations'];
  const live = new Set();
  let imports = 0;
  let calls = 0;
  for (const statement of root.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) &&
      ts.isNamedImports(statement.importClause?.namedBindings)) {
      if (statement.moduleSpecifier.text === './lib/external-beta-readiness-contract-admission.mjs') {
        imports += statement.importClause.namedBindings.elements.filter(x =>
          !x.propertyName && x.name.text === 'validateExternalBetaContractAdmission').length;
      }
      if (statement.moduleSpecifier.text === 'node:fs') {
        for (const x of statement.importClause.namedBindings.elements) {
          if (!x.propertyName) live.add(x.name.text);
        }
      }
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) live.add(declaration.name.text);
      }
    }
    if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) &&
      ts.isIdentifier(statement.expression.expression) &&
      statement.expression.expression.text === 'validateExternalBetaContractAdmission') {
      const args = statement.expression.arguments;
      const props = args.length === 1 && ts.isObjectLiteralExpression(args[0]) ? args[0].properties : [];
      const names = props.filter(ts.isShorthandPropertyAssignment).map(x => x.name.text);
      if (names.length === required.length && props.length === required.length &&
        required.every(name => names.includes(name) && live.has(name))) calls++;
    }
  }
  return imports === 1 && calls === 1;
}

test('runner delegates once at module scope with five live dependencies', () => {
  const source = readFileSync(new URL('../check-external-beta-readiness.mjs', import.meta.url), 'utf8');
  assert.equal(inspectEntrypoint(source), true);
  const call = 'validateExternalBetaContractAdmission({ contract, contractPath, scripts, existsSync, violations });';
  assert.ok(source.includes(call));
  const mutations = [
    source.replace(call, '// ' + call),
    source.replace(call, 'function neverUsed() { ' + call + ' }'),
    source.replace(call,
      'validateExternalBetaContractAdmission({ contract, contractPath, /* scripts, */ existsSync, violations });'),
    source.replace('./lib/external-beta-readiness-contract-admission.mjs', './lib/unrelated-admission.mjs'),
  ];
  for (const altered of mutations) {
    assert.notEqual(altered, source);
    assert.equal(inspectEntrypoint(altered), false);
  }
});
