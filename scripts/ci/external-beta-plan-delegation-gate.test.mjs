import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
const moduleName = './lib/external-beta-evidence-plan.mjs';
const requiredBindings = [
  'runnerId', 'mode', 'duplicateEvidencePathViolationsByJob', 'missingRequiredEnv',
  'missingOptionalEnvNames', 'jobPreflightViolations', 'jobExecutionReadiness', 'percent',
];

function assertDirectPlanDelegation(text) {
  const ast = ts.createSourceFile('external-beta-evidence-runner.mjs', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0);
  const imports = ast.statements.filter(node => ts.isImportDeclaration(node) && node.moduleSpecifier.text === moduleName);
  assert.equal(imports.length, 1, 'must import the plan builder exactly once');
  const names = imports[0].importClause?.namedBindings?.elements?.map(node => node.name.text);
  assert.deepEqual(names, ['buildExternalBetaPlan']);
  const declarations = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'buildPlan');
  assert.equal(declarations.length, 1, 'existing CLI builder must delegate exactly once');
  const statements = declarations[0].body?.statements ?? [];
  assert.equal(statements.length, 1, 'builder must have a single unconditional return');
  assert.ok(ts.isReturnStatement(statements[0]));
  const call = statements[0].expression;
  assert.ok(call && ts.isCallExpression(call) && ts.isIdentifier(call.expression));
  assert.equal(call.expression.text, 'buildExternalBetaPlan');
  assert.equal(call.arguments.length, 2);
  assert.ok(ts.isIdentifier(call.arguments[0]) && call.arguments[0].text === 'planJobs');
  assert.ok(ts.isObjectLiteralExpression(call.arguments[1]));
  const keys = call.arguments[1].properties.map(p => p.name?.text);
  assert.deepEqual(keys, requiredBindings);
  for (const property of call.arguments[1].properties.slice(2)) {
    assert.ok(ts.isShorthandPropertyAssignment(property), 'original checker dependency identity must be preserved');
  }
}

test('original CLI directly delegates plan creation with original policies', () => {
  assertDirectPlanDelegation(source);
});

test('missing, dormant, or duplicated plan delegations are rejected', () => {
  const anchor = '  return buildExternalBetaPlan(planJobs, {';
  assert.ok(source.includes(anchor));
  for (const value of [
    '  return { jobs: [] }; // buildExternalBetaPlan(planJobs, {',
    '  if (false) return buildExternalBetaPlan(planJobs, {',
    anchor + '\n' + anchor,
  ]) {
    assert.throws(() => assertDirectPlanDelegation(source.replace(anchor, value)));
  }
});

test('missing imports or altered policy callbacks are rejected', () => {
  assert.throws(() => assertDirectPlanDelegation(source.replace(
    "import { buildExternalBetaPlan } from './lib/external-beta-evidence-plan.mjs';", '',
  )));
  assert.throws(() => assertDirectPlanDelegation(source.replace(
    '    jobExecutionReadiness,', "    jobExecutionReadiness: () => 'live_command_executable',",
  )));
});
