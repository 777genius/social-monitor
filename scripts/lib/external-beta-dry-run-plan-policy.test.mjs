import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { createExternalBetaDryRunPlanPolicy } from './external-beta-dry-run-plan-policy.mjs';

const ts = createRequire(import.meta.url)('typescript');

function fixture() {
  const runner = {
    runnerId: 'test-runner',
    jsonPlanCommand: 'npm run plan-json',
    handoffCommand: 'npm run handoff',
    handoffJsonCommand: 'npm run handoff-json',
    summaryCommand: 'npm run summary',
    preflightCommand: 'npm run preflight',
    artifactValidationCommand: 'npm run artifact-validation',
    currentPackageCommand: 'npm run current',
  };
  const dryRun = {
    schemaVersion: 1, scope: 'backend-only', frontendPolicy: 'deferred_contract_only',
    defaultMode: 'plan_only', notEvidence: true, doesNotUnblockExternalBeta: true,
    sourceRunnerContract: 'exists', sourceReadinessContract: 'exists', envExample: 'exists',
    planJsonCommand: runner.jsonPlanCommand, handoffCommand: runner.handoffCommand,
    handoffJsonCommand: runner.handoffJsonCommand, summaryCommand: runner.summaryCommand,
    preflightCommand: runner.preflightCommand,
    artifactValidationCommand: runner.artifactValidationCommand,
    currentPackageCommand: runner.currentPackageCommand,
    liveExecutionTemplate: 'EXTERNAL_BETA_EVIDENCE_CONFIRM=run-live node runner --execute',
    expectedPlanCountsWithoutCredentials: { jobCount: 1 },
    requiredJobIds: ['local'], requiredMissingEnvWithoutCredentials: [],
    requiredReadinessStatesWithoutCredentials: ['local_contract_ready'],
  };
  const plan = {
    runnerId: runner.runnerId, mode: 'plan_only', jobCount: 1, uniqueMissingEnv: [],
    readinessCounts: { local_contract_ready: 1 },
    jobs: [{
      jobId: 'local', blocksExternalBeta: true, owner: 'source-owner',
      exitCondition: 'validated', validationCommands: ['npm run check:contract'],
      runPolicy: 'local_contract', executionReadiness: 'local_contract_ready',
    }],
  };
  const violations = [];
  function assertSameSet(actual, expected, label) {
    const actualSorted = [...new Set(actual)].sort();
    const expectedSorted = [...new Set(expected)].sort();
    if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
      violations.push(label + ': expected [' + expectedSorted.join(', ') +
        '], got [' + actualSorted.join(', ') + ']');
    }
  }
  const dependencies = {
    dryRun, runner, plan, dryRunPath: 'dry-run.json', runnerPath: 'runner.json',
    existsSync: (path) => path === 'exists', assertSameSet, violations,
  };
  const checks = createExternalBetaDryRunPlanPolicy(dependencies);
  return { dryRun, runner, plan, violations, dependencies, ...checks };
}

test('missing live dependencies fail immediately with explicit initialization errors', () => {
  const { dependencies } = fixture();
  assert.throws(
    () => createExternalBetaDryRunPlanPolicy(),
    { name: 'TypeError', message: 'external beta dry-run plan policy requires dryRun' },
  );
  for (const name of Object.keys(dependencies)) {
    for (const value of [undefined, null]) {
      assert.throws(
        () => createExternalBetaDryRunPlanPolicy({ ...dependencies, [name]: value }),
        { name: 'TypeError', message: `external beta dry-run plan policy requires ${name}` },
      );
    }
  }
});

test('valid clean-env dry-run contract and plan preserve zero diagnostics', () => {
  const f = fixture();
  f.validateDryRunContract();
  f.validatePlanShape();
  assert.deepEqual(f.violations, []);
});

test('contract errors retain legacy ordering and no-live-execution policy', () => {
  const f = fixture();
  f.dryRun.scope = 'frontend-enabled';
  f.dryRun.sourceReadinessContract = '/not-present';
  f.dryRun.liveExecutionTemplate = 'unsafe';
  f.validateDryRunContract();
  assert.deepEqual(f.violations, [
    'dry-run.json: scope must be backend-only',
    'dry-run.json: referenced file must exist: /not-present',
    'dry-run.json: liveExecutionTemplate must include explicit live confirmation',
    'dry-run.json: liveExecutionTemplate must include --execute',
  ]);
});

test('plan gates remain fail-closed for live jobs without credentials', () => {
  const f = fixture();
  f.plan.jobs[0].runPolicy = 'live_command';
  f.plan.jobs[0].executionReadiness = 'local_contract_ready';
  f.plan.jobs[0].runnerCommand = undefined;
  f.validatePlanShape();
  assert.deepEqual(f.violations, [
    'dry-run.json: local external evidence job must stay blocked without credentials',
    'dry-run.json: local live command job must expose runnerCommand',
  ]);
});

test('policy uses live contract objects instead of freezing state at creation', () => {
  const f = fixture();
  f.dryRun.defaultMode = 'execute';
  f.plan.mode = 'execute';
  f.plan.uniqueMissingEnv.push('SECRET_REFERENCE');
  f.validateDryRunContract();
  f.validatePlanShape();
  assert.ok(f.violations.includes('dry-run.json: defaultMode must be plan_only'));
  assert.ok(f.violations.includes('dry-run.json: clean-env plan must stay plan_only'));
  assert.ok(f.violations.some((value) => value.includes('requiredMissingEnvWithoutCredentials')));
});

const POLICY_DEPENDENCIES = [
  'dryRun', 'runner', 'plan', 'dryRunPath', 'runnerPath',
  'existsSync', 'assertSameSet', 'violations',
];

function inspectRunnerWiring(source) {
  const tree = ts.createSourceFile('check-external-beta-evidence-dry-run.mjs', source,
    ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const imports = new Set();
  const calls = new Set();
  const declared = new Set();
  let factoryBound = false;
  for (const statement of tree.statements) {
    if (!ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== './lib/external-beta-dry-run-plan-policy.mjs' ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)) continue;
    for (const element of statement.importClause.namedBindings.elements) {
      if (!element.propertyName) imports.add(element.name.text);
    }
  }
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      calls.add(node.expression.text);
    }
    if (ts.isFunctionDeclaration(node) && node.name) declared.add(node.name.text);
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) &&
      node.initializer && ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === 'createExternalBetaDryRunPlanPolicy' &&
      node.initializer.arguments.length === 1 &&
      ts.isObjectLiteralExpression(node.initializer.arguments[0])) {
      const bindings = new Set(node.name.elements
        .filter((element) => !element.propertyName && ts.isIdentifier(element.name))
        .map((element) => element.name.text));
      const dependencies = new Set(node.initializer.arguments[0].properties
        .filter(ts.isShorthandPropertyAssignment)
        .map((property) => property.name.text));
      factoryBound ||= ['validateDryRunContract', 'validatePlanShape'].every(
        (name) => bindings.has(name)) &&
        POLICY_DEPENDENCIES.every((name) => dependencies.has(name));
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return { imports, calls, declared, factoryBound };
}

test('runner delegates real policy imports, bindings and invoked validators', () => {
  const runnerSource = readFileSync(
    new URL('../check-external-beta-evidence-dry-run.mjs', import.meta.url), 'utf8');
  const wiring = inspectRunnerWiring(runnerSource);
  assert.ok(wiring.imports.has('createExternalBetaDryRunPlanPolicy'),
    'runner must import the extracted policy from its real owner');
  assert.ok(wiring.factoryBound, 'runner must bind validators to the eight live dependencies');
  for (const name of ['validateDryRunContract', 'validatePlanShape']) {
    assert.ok(wiring.calls.has(name), name + ' must actually be called');
    assert.ok(!wiring.declared.has(name), name + ' must not be locally redefined');
  }
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts['check:architecture'],
    /scripts\/lib\/external-beta-dry-run-plan-policy\.test\.mjs/);
});

test('comment-only wiring markers and wrong import owner cannot pass', () => {
  const source = readFileSync(
    new URL('../check-external-beta-evidence-dry-run.mjs', import.meta.url), 'utf8');
  const commentOnlyFactory = source.replace(
    'createExternalBetaDryRunPlanPolicy({',
    'unrelated(/* createExternalBetaDryRunPlanPolicy({ */ {',
  );
  assert.notEqual(commentOnlyFactory, source, 'mutation must replace real factory call');
  assert.ok(commentOnlyFactory.includes('createExternalBetaDryRunPlanPolicy({'),
    'old regex would falsely accept factory marker inside a comment');
  assert.equal(inspectRunnerWiring(commentOnlyFactory).factoryBound, false);
  const wrongOwner = source.replace(
    "from './lib/external-beta-dry-run-plan-policy.mjs';",
    "from './lib/unrelated-dry-run-policy.mjs';",
  );
  assert.notEqual(wrongOwner, source, 'mutation must change the import');
  assert.equal(inspectRunnerWiring(wrongOwner).imports.has('createExternalBetaDryRunPlanPolicy'), false);
  const commentOnlyValidator = source.replace(
    'validatePlanShape();', 'void 0; // validatePlanShape();',
  );
  assert.notEqual(commentOnlyValidator, source, 'mutation must replace validator call');
  assert.equal(inspectRunnerWiring(commentOnlyValidator).calls.has('validatePlanShape'), false);
});
