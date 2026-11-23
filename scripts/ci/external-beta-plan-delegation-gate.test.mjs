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
  const [runnerId, mode] = call.arguments[1].properties;
  assert.ok(ts.isPropertyAssignment(runnerId));
  assert.equal(runnerId.initializer.getText(ast), 'contract.runnerId', 'CLI must pass the tracked runner id');
  assert.ok(ts.isPropertyAssignment(mode));
  assert.equal(
    mode.initializer.getText(ast),
    "execute ? 'execute' : validateArtifacts ? 'validate_artifacts' : 'plan_only'",
    'CLI must pass the existing selected execution mode',
  );
  for (const property of call.arguments[1].properties.slice(2)) {
    assert.ok(ts.isShorthandPropertyAssignment(property), 'original checker dependency identity must be preserved');
  }

  // An intact helper still breaks the CLI if its original call site is removed.
  const callSites = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'buildPlan') {
      callSites.push(node);
    }
    ts.forEachChild(node, visit);
  };
  for (const statement of ast.statements) visit(statement);
  assert.equal(callSites.length, 1, 'original CLI must invoke buildPlan exactly once');
  const planCall = callSites[0];
  assert.equal(planCall.arguments.length, 1);
  assert.ok(ts.isIdentifier(planCall.arguments[0]) && planCall.arguments[0].text === 'jobs',
    'the selected CLI jobs must be passed to buildPlan');
  const declaration = planCall.parent;
  assert.ok(ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name)
    && declaration.name.text === 'plan', 'the original plan variable must capture the result');
  assert.ok(ts.isVariableDeclarationList(declaration.parent)
    && (declaration.parent.flags & ts.NodeFlags.Const), 'the plan must retain its const declaration');
  const variableStatement = declaration.parent.parent;
  assert.ok(ts.isVariableStatement(variableStatement));
  const parentBlock = variableStatement.parent;
  assert.ok(ts.isBlock(parentBlock));
  const guard = parentBlock.parent;
  assert.ok(ts.isIfStatement(guard) && guard.thenStatement === parentBlock
    && ts.isSourceFile(guard.parent), 'the plan invocation must remain in the top-level CLI guard');
  assert.equal(guard.expression.getText(ast), '!execute && !validateArtifacts',
    'the original CLI mode guard must remain unchanged');
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
  assert.throws(() => assertDirectPlanDelegation(source.replace(
    '    runnerId: contract.runnerId,', "    runnerId: 'forged',",
  )));
  assert.throws(() => assertDirectPlanDelegation(source.replace(
    "    mode: execute ? 'execute' : validateArtifacts ? 'validate_artifacts' : 'plan_only',",
    "    mode: 'plan_only',",
  )));
});


test('the CLI plan call cannot be removed, dormant, duplicated, or fed unselected jobs', () => {
  const callSite = '  const plan = buildPlan(jobs);';
  const originalGuard = 'if (!execute && !validateArtifacts) {';
  assert.ok(source.includes(callSite));
  assert.ok(source.includes(originalGuard));
  for (const modified of [
    source.replace(callSite, '  const plan = { jobs: [] }; // buildPlan(jobs);'),
    source.replace(callSite, '  const plan = buildPlan([]);'),
    source.replace(originalGuard, 'if (false) {'),
    source.replace(callSite, callSite + '\n  buildPlan(jobs);'),
    source.replace(callSite, '  if (false) { const plan = buildPlan(jobs); }'),
  ]) {
    assert.throws(() => assertDirectPlanDelegation(modified));
  }
});
