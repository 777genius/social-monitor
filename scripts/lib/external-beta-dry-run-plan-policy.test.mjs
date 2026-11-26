import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { dryRunCliFixture } from './external-beta-dry-run-cli-fixture.mjs';
import { createExternalBetaDryRunPlanPolicy } from './external-beta-dry-run-plan-policy.mjs';
import { createExternalBetaDryRunHandoffPolicy } from './external-beta-dry-run-handoff-policy.mjs';
import { createExternalBetaDryRunSafetyLinkagePolicy } from './external-beta-dry-run-safety-linkage-policy.mjs';
import { createExternalBetaDryRunPackageAdmission } from './external-beta-dry-run-package-admission.mjs';

const ts = createRequire(import.meta.url)('typescript');

function fixture(existingPaths = new Set(['exists'])) {
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
    existsSync: (path) => existingPaths.has(path), assertSameSet, violations,
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

test('non-callable plan policy callbacks fail at factory initialization', () => {
  const { dependencies } = fixture();
  for (const name of ['existsSync', 'assertSameSet']) {
    for (const value of [false, 0, 'not callable', {}, []]) {
      assert.throws(
        () => createExternalBetaDryRunPlanPolicy({ ...dependencies, [name]: value }),
        { name: 'TypeError', message: `external beta dry-run plan policy requires ${name} to be a function` },
      );
    }
  }
});

test('plan policy rejects invalid structured dependencies before entering validation', () => {
  const { dependencies } = fixture();
  const cases = [
    ...['dryRun', 'runner', 'plan'].flatMap((name) =>
      [false, [], 'invalid'].map((value) => [name, value, 'an object'])),
    ...['dryRunPath', 'runnerPath'].map((name) => [name, 42, 'a string']),
    ['violations', {}, 'an array'],
  ];
  for (const [name, value, type] of cases) {
    assert.throws(() => createExternalBetaDryRunPlanPolicy({ ...dependencies, [name]: value }),
      { name: 'TypeError', message: `external beta dry-run plan policy requires ${name} to be ${type}` });
  }
});

test('valid clean-env dry-run contract and plan preserve zero diagnostics', () => {
  const f = fixture(new Set(['config/runner.json', '/tmp/readiness.json', 'fixtures/.env']));
  f.dryRun.sourceRunnerContract = 'config/runner.json';
  f.dryRun.sourceReadinessContract = '/tmp/readiness.json';
  f.dryRun.envExample = 'fixtures/.env';
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

test('dry-run references and command parity keep deterministic diagnostics', () => {
  const f = fixture();
  f.dryRun.envExample = 'missing-reference';
  f.dryRun.currentPackageCommand = 'npm run unexpected';
  f.validateDryRunContract();
  assert.deepEqual(f.violations, [
    'dry-run.json: referenced file must exist: missing-reference',
    'dry-run.json: currentPackageCommand must match runner currentPackageCommand',
  ]);
});

test('manual artifact evidence cannot bypass block or expose a live runner', () => {
  const f = fixture();
  const job = f.plan.jobs[0];
  job.blocksExternalBeta = false;
  job.owner = ' ';
  job.exitCondition = '';
  job.validationCommands = [];
  job.runPolicy = 'manual_artifact_then_validator';
  job.executionReadiness = 'local_contract_ready';
  job.runnerCommand = 'node run-live';
  f.validatePlanShape();
  assert.deepEqual(f.violations, [
    'dry-run.json: local must remain an external beta blocker',
    'dry-run.json: local must define owner',
    'dry-run.json: local must define exitCondition',
    'dry-run.json: local must define validationCommands',
    'dry-run.json: local external evidence job must stay blocked without credentials',
    'dry-run.json: local manual artifact job must not expose runnerCommand',
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
  const topLevelValidatorCalls = tree.statements
    .filter((statement) => ts.isExpressionStatement(statement) &&
      ts.isCallExpression(statement.expression) &&
      ts.isIdentifier(statement.expression.expression))
    .map((statement) => statement.expression.expression.text)
    .filter((name) => name === 'validateDryRunContract' || name === 'validatePlanShape');
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
    if (ts.isFunctionDeclaration(node) && node.name) declared.add(node.name.text);
    if (ts.isVariableDeclaration(node) && node.parent?.parent?.parent === tree &&
      ts.isObjectBindingPattern(node.name) &&
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
  return { imports, topLevelValidatorCalls, declared, factoryBound };
}

test('runner delegates real policy imports, bindings and invoked validators', () => {
  const runnerSource = readFileSync(
    new URL('../check-external-beta-evidence-dry-run.mjs', import.meta.url), 'utf8');
  const wiring = inspectRunnerWiring(runnerSource);
  assert.ok(wiring.imports.has('createExternalBetaDryRunPlanPolicy'),
    'runner must import the extracted policy from its real owner');
  assert.ok(wiring.factoryBound, 'runner must bind validators to the eight live dependencies');
  assert.deepEqual(wiring.topLevelValidatorCalls, ['validateDryRunContract', 'validatePlanShape'],
    'runner must invoke both validators at top level, exactly once, in legacy order');
  for (const name of ['validateDryRunContract', 'validatePlanShape']) {
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
  const originalFactoryBinding =
    'const { validateDryRunContract, validatePlanShape } = createExternalBetaDryRunPlanPolicy({\n' +
    '  dryRun, runner, plan, dryRunPath, runnerPath, existsSync, assertSameSet, violations,\n' +
    '});';
  const neverInvokedFactory = source.replace(
    originalFactoryBinding,
    'function neverInvokedFactory() {\n' + originalFactoryBinding + '\n}',
  );
  assert.notEqual(neverInvokedFactory, source, 'mutation must relocate factory binding');
  const nestedWiring = inspectRunnerWiring(neverInvokedFactory);
  assert.deepEqual(nestedWiring.topLevelValidatorCalls,
    ['validateDryRunContract', 'validatePlanShape'],
    'top-level calls remain but their factory-provided bindings are unavailable');
  assert.equal(nestedWiring.factoryBound, false,
    'factory binding in a never-invoked nested function must not pass E2E wiring');
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
  assert.deepEqual(inspectRunnerWiring(commentOnlyValidator).topLevelValidatorCalls,
    ['validateDryRunContract']);
  const deadFunction = source.replace(
    'validateDryRunContract();\nvalidatePlanShape();',
    'function neverCalled() {\n  validateDryRunContract();\n  validatePlanShape();\n}',
  );
  assert.notEqual(deadFunction, source, 'mutation must move both calls off the top level');
  assert.deepEqual(inspectRunnerWiring(deadFunction).topLevelValidatorCalls, [],
    'validator calls in a never-invoked nested function must not satisfy runner delegation');
  const reversedCalls = source.replace(
    'validateDryRunContract();\nvalidatePlanShape();',
    'validatePlanShape();\nvalidateDryRunContract();',
  );
  assert.notEqual(reversedCalls, source, 'mutation must reverse validator calls');
  assert.deepEqual(inspectRunnerWiring(reversedCalls).topLevelValidatorCalls,
    ['validatePlanShape', 'validateDryRunContract'], 'legacy validator order must be observable');
});


test('real dry-run CLI accepts a clean-env plan/handoff without executing live jobs', () => {
  const f = dryRunCliFixture();
  try {
    const result = f.run();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, 'External beta evidence dry-run package OK\n');
  } finally {
    f.cleanup();
  }
});

test('real CLI rejects unsafe contract and plan modes in original diagnostic order', () => {
  const f = dryRunCliFixture();
  try {
    f.dryRun.defaultMode = 'execute';
    f.dryRun.liveExecutionTemplate = 'node runner --execute';
    f.plan.mode = 'execute';
    f.handoff.safety.envValuePolicy = 'commit_values';
    const result = f.run();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.deepEqual(result.stderr.trimEnd().split('\n'), [
      'ops/release/external-beta-evidence-dry-run.json: defaultMode must be plan_only',
      'ops/release/external-beta-evidence-dry-run.json: liveExecutionTemplate must include explicit live confirmation',
      'ops/release/external-beta-evidence-dry-run.json: clean-env plan must stay plan_only',
      'ops/release/external-beta-evidence-dry-run.json: JSON handoff safety.envValuePolicy must be names_only',
    ]);
  } finally {
    f.cleanup();
  }
});

test('real CLI rejects nonblocking, noncredentialed live jobs without invoking them', () => {
  const f = dryRunCliFixture();
  try {
    f.plan.jobs.push({
      jobId: 'unsafe-live', blocksExternalBeta: false, owner: ' ', exitCondition: '',
      validationCommands: [], runPolicy: 'live_command', executionReadiness: 'local_contract_ready',
    });
    const result = f.run();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    const lines = result.stderr.trimEnd().split('\n');
    const expected = [
      'ops/release/external-beta-evidence-dry-run.json: unsafe-live must remain an external beta blocker',
      'ops/release/external-beta-evidence-dry-run.json: unsafe-live must define owner',
      'ops/release/external-beta-evidence-dry-run.json: unsafe-live must define exitCondition',
      'ops/release/external-beta-evidence-dry-run.json: unsafe-live must define validationCommands',
      'ops/release/external-beta-evidence-dry-run.json: unsafe-live external evidence job must stay blocked without credentials',
      'ops/release/external-beta-evidence-dry-run.json: unsafe-live live command job must expose runnerCommand',
    ];
    const indices = expected.map((line) => lines.indexOf(line));
    assert.ok(indices.every((index) => index >= 0), result.stderr);
    assert.deepEqual(indices, [...indices].sort((a, b) => a - b),
      'real CLI diagnostics must preserve legacy order');
    assert.equal(result.stdout, '');
  } finally {
    f.cleanup();
  }
});


test('extracted JSON handoff policy preserves exact root diagnostic order', () => {
  const f = dryRunCliFixture();
  try {
    const violations = [];
    const assertSameSet = (actual, expected, label) => {
      assert.deepEqual([...new Set(actual)].sort(), [...new Set(expected)].sort(), label);
    };
    const { validateHandoffShape } = createExternalBetaDryRunHandoffPolicy({
      handoff: f.handoff, runner: f.runner, dryRun: f.dryRun,
      dryRunPath: 'dry-run.json', runnerPath: 'runner.json',
      plan: f.plan, violations, assertSameSet,
    });
    validateHandoffShape();
    assert.deepEqual(violations, [], 'valid synthetic handoff must be accepted');
    f.handoff.inputMatrix.secretValuePolicy = 'committed_values';
    f.handoff.safety.envValuePolicy = 'committed_values';
    f.handoff.readiness.totalJobs = 9;
    validateHandoffShape();
    assert.deepEqual(violations, [
      'dry-run.json: JSON handoff input matrix must preserve secret value policy',
      'dry-run.json: JSON handoff safety.envValuePolicy must be names_only',
      'dry-run.json: JSON handoff readiness.totalJobs must be 0, got 9',
    ]);
  } finally {
    f.cleanup();
  }
});

test('extracted JSON handoff policy retains fail-closed per-job diagnostics', () => {
  const f = dryRunCliFixture();
  try {
    f.dryRun.requiredJobIds = ['evidence-one'];
    f.plan.jobs = [{ jobId: 'evidence-one', executionReadiness: 'blocked_missing_required_env' }];
    f.handoff.jobs = [{
      jobId: 'evidence-one', executionReadiness: 'local_contract_ready',
      operatorAction: [], outputArtifacts: [], requiredInputs: [], requiredEnv: [],
      optionalInputs: [], optionalEnv: [],
    }];
    const violations = [];
    const assertSameSet = (actual, expected, label) => {
      assert.deepEqual([...new Set(actual)].sort(), [...new Set(expected)].sort(), label);
    };
    createExternalBetaDryRunHandoffPolicy({
      handoff: f.handoff, runner: f.runner, dryRun: f.dryRun,
      dryRunPath: 'dry-run.json', runnerPath: 'runner.json',
      plan: f.plan, violations, assertSameSet,
    }).validateHandoffShape();
    assert.deepEqual(violations, [
      'dry-run.json: JSON handoff evidence-one readiness must match plan',
      'dry-run.json: JSON handoff evidence-one must include operatorAction',
      'dry-run.json: JSON handoff evidence-one must include outputArtifacts',
    ]);
  } finally {
    f.cleanup();
  }
});

function inspectHandoffDelegation(source) {
  const tree = ts.createSourceFile('check-external-beta-evidence-dry-run.mjs', source,
    ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const factoryName = 'createExternalBetaDryRunHandoffPolicy';
  const importFound = tree.statements.some((statement) =>
    ts.isImportDeclaration(statement) &&
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === './lib/external-beta-dry-run-handoff-policy.mjs' &&
    statement.importClause?.namedBindings &&
    ts.isNamedImports(statement.importClause.namedBindings) &&
    statement.importClause.namedBindings.elements.some((element) =>
      !element.propertyName && element.name.text === factoryName));
  let bound = false;
  for (const statement of tree.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const node of statement.declarationList.declarations) {
      if (!ts.isObjectBindingPattern(node.name) ||
        !node.initializer || !ts.isCallExpression(node.initializer) ||
        !ts.isIdentifier(node.initializer.expression) ||
        node.initializer.expression.text !== factoryName ||
        node.initializer.arguments.length !== 1 ||
        !ts.isObjectLiteralExpression(node.initializer.arguments[0])) continue;
      const bindings = new Set(node.name.elements
        .filter((element) => !element.propertyName && ts.isIdentifier(element.name))
        .map((element) => element.name.text));
      const injected = new Set(node.initializer.arguments[0].properties
        .filter(ts.isShorthandPropertyAssignment).map((property) => property.name.text));
      bound ||= bindings.has('validateHandoffShape') &&
        ['handoff', 'runner', 'dryRun', 'dryRunPath', 'runnerPath', 'plan',
          'violations', 'assertSameSet'].every((name) => injected.has(name));
    }
  }
  const calledAtTopLevel = tree.statements.some((statement) =>
    ts.isExpressionStatement(statement) &&
    ts.isCallExpression(statement.expression) &&
    ts.isIdentifier(statement.expression.expression) &&
    statement.expression.expression.text === 'validateHandoffShape');
  const localDefinition = tree.statements.some((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === 'validateHandoffShape');
  return { importFound, bound, calledAtTopLevel, localDefinition };
}

test('real JSON handoff delegation rejects dead/comment-only and wrong-owner wiring', () => {
  const source = readFileSync(
    new URL('../check-external-beta-evidence-dry-run.mjs', import.meta.url), 'utf8');
  assert.deepEqual(inspectHandoffDelegation(source), {
    importFound: true, bound: true, calledAtTopLevel: true, localDefinition: false,
  });
  const binding = 'const { validateHandoffShape } = createExternalBetaDryRunHandoffPolicy({\n' +
    '  handoff, runner, dryRun, dryRunPath, runnerPath, plan, violations, assertSameSet,\n' +
    '});';
  assert.ok(source.includes(binding), 'positive fixture must contain real binding');
  const dead = source.replace(binding, 'function dead() {\n' + binding + '\n}');
  assert.equal(inspectHandoffDelegation(dead).bound, false);
  assert.equal(inspectHandoffDelegation(dead).calledAtTopLevel, true);
  const commented = source.replace('createExternalBetaDryRunHandoffPolicy({',
    'unrelated(/* createExternalBetaDryRunHandoffPolicy({ */ {');
  assert.equal(inspectHandoffDelegation(commented).bound, false);
  const wrongOwner = source.replace("from './lib/external-beta-dry-run-handoff-policy.mjs';",
    "from './lib/unrelated-handoff-policy.mjs';");
  assert.equal(inspectHandoffDelegation(wrongOwner).importFound, false);
});

test('JSON handoff factory rejects absent and non-callable injected dependencies before validation', () => {
  const { dependencies } = fixture();
  const valid = { ...dependencies, handoff: {} };
  assert.equal(typeof createExternalBetaDryRunHandoffPolicy(valid).validateHandoffShape, 'function');
  assert.throws(
    () => createExternalBetaDryRunHandoffPolicy(),
    { name: 'TypeError', message: 'external beta dry-run handoff policy requires handoff' },
  );
  for (const name of [
    'handoff', 'runner', 'dryRun', 'dryRunPath', 'runnerPath', 'plan', 'violations', 'assertSameSet',
  ]) {
    for (const value of [null, undefined]) {
      assert.throws(
        () => createExternalBetaDryRunHandoffPolicy({ ...valid, [name]: value }),
        { name: 'TypeError', message: `external beta dry-run handoff policy requires ${name}` },
      );
    }
  }
  assert.throws(
    () => createExternalBetaDryRunHandoffPolicy({ ...valid, assertSameSet: 42 }),
    { name: 'TypeError', message: 'external beta dry-run handoff policy requires assertSameSet to be a function' },
  );
});

test('safety policy preserves original forbidden-target, blocker, and command diagnostics order', () => {
  const runner = {
    executionSafety: { forbiddenTargets: [] },
    jobs: [{
      jobId: 'live-demo', blocksExternalBeta: false, runPolicy: 'local_contract',
      runnerCommand: 'curl prod-internal', validationCommands: ['echo prod-internal'],
    }],
  };
  const dryRun = { forbiddenTargets: ['prod-internal'], checkCommand: 'curl prod-internal' };
  const violations = [];
  createExternalBetaDryRunSafetyLinkagePolicy({
    runner, dryRun, readiness: {}, runnerPath: 'runner.json',
    dryRunPath: 'dry-run.json', readinessPath: 'readiness.json', violations,
  }).validateRunnerSafety();
  assert.deepEqual(violations, [
    'runner.json: executionSafety.forbiddenTargets must include prod-internal',
    'dry-run.json: dry-run commands must not target prod-internal',
    'runner.json: live-demo must block external beta',
    'runner.json: live-demo command must not target prod-internal: curl prod-internal',
    'runner.json: live-demo command must not target prod-internal: echo prod-internal',
  ]);
});

test('readiness linkage policy preserves all six diagnostic checks and ordering', () => {
  const dryRun = {
    planJsonCommand: 'node plan', handoffJsonCommand: 'node handoff',
    currentPackageCommand: 'node package',
  };
  const readiness = {
    externalBetaDecision: 'go', evidenceMode: 'unverified',
    evidenceRunner: {
      contract: 'wrong.json', jsonPlanCommand: 'wrong plan',
      handoffJsonCommand: 'wrong handoff', currentPackageCommand: 'wrong package',
    },
  };
  const violations = [];
  createExternalBetaDryRunSafetyLinkagePolicy({
    runner: {}, dryRun, readiness, runnerPath: 'runner.json',
    dryRunPath: 'dry-run.json', readinessPath: 'readiness.json', violations,
  }).validateReadinessLinkage();
  assert.deepEqual(violations, [
    'readiness.json: externalBetaDecision must stay hold until live evidence is attached',
    'readiness.json: evidenceMode must require external evidence',
    'readiness.json: evidenceRunner.contract must point at runner.json',
    'readiness.json: evidenceRunner.jsonPlanCommand must match dry-run plan command',
    'readiness.json: evidenceRunner.handoffJsonCommand must match dry-run JSON handoff command',
    'readiness.json: evidenceRunner.currentPackageCommand must match dry-run current package command',
  ]);
});

test('safety policy fails fast on missing injected dependencies', () => {
  const live = {
    runner: {}, dryRun: {}, readiness: {},
    runnerPath: 'runner.json', dryRunPath: 'dry-run.json',
    readinessPath: 'readiness.json', violations: [],
  };
  assert.deepEqual(Object.keys(createExternalBetaDryRunSafetyLinkagePolicy(live)),
    ['validateRunnerSafety', 'validateReadinessLinkage']);
  assert.throws(() => createExternalBetaDryRunSafetyLinkagePolicy(),
    { name: 'TypeError', message: 'external beta dry-run safety linkage policy requires runner' });
  for (const name of Object.keys(live)) {
    for (const value of [null, undefined]) {
      assert.throws(
        () => createExternalBetaDryRunSafetyLinkagePolicy({ ...live, [name]: value }),
        { name: 'TypeError', message: 'external beta dry-run safety linkage policy requires ' + name },
      );
    }
  }
});

test('real CLI rejects unsafe runner commands and premature GO without running live jobs', () => {
  const f = dryRunCliFixture();
  try {
    f.dryRun.forbiddenTargets = ['prod-internal'];
    f.dryRun.checkCommand = 'curl prod-internal';
    f.runner.jobs.push({
      jobId: 'live-demo', blocksExternalBeta: false, runPolicy: 'local_contract',
      runnerCommand: 'curl prod-internal', validationCommands: ['echo prod-internal'],
    });
    f.readiness.externalBetaDecision = 'go';
    const result = f.run();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.deepEqual(result.stderr.trimEnd().split('\n'), [
      'ops/release/external-beta-evidence-runner.json: executionSafety.forbiddenTargets must include prod-internal',
      'ops/release/external-beta-evidence-dry-run.json: dry-run commands must not target prod-internal',
      'ops/release/external-beta-evidence-runner.json: live-demo must block external beta',
      'ops/release/external-beta-evidence-runner.json: live-demo command must not target prod-internal: curl prod-internal',
      'ops/release/external-beta-evidence-runner.json: live-demo command must not target prod-internal: echo prod-internal',
      'ops/release/external-beta-readiness-contract.json: externalBetaDecision must stay hold until live evidence is attached',
    ]);
  } finally {
    f.cleanup();
  }
});

function inspectSafetyLinkageDelegation(source) {
  const tree = ts.createSourceFile('check-external-beta-evidence-dry-run.mjs', source,
    ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const imported = tree.statements.some((statement) =>
    ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === './lib/external-beta-dry-run-safety-linkage-policy.mjs' &&
    statement.importClause?.namedBindings &&
    ts.isNamedImports(statement.importClause.namedBindings) &&
    statement.importClause.namedBindings.elements.some((element) =>
      !element.propertyName && element.name.text === 'createExternalBetaDryRunSafetyLinkagePolicy'));
  const bound = tree.statements.some((statement) =>
    ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some((decl) => {
      if (!ts.isObjectBindingPattern(decl.name) ||
        !decl.initializer || !ts.isCallExpression(decl.initializer) ||
        !ts.isIdentifier(decl.initializer.expression) ||
        decl.initializer.expression.text !== 'createExternalBetaDryRunSafetyLinkagePolicy' ||
        decl.initializer.arguments.length !== 1 ||
        !ts.isObjectLiteralExpression(decl.initializer.arguments[0])) return false;
      const names = decl.name.elements.filter((node) => !node.propertyName)
        .map((node) => node.name.text);
      const supplied = decl.initializer.arguments[0].properties
        .filter(ts.isShorthandPropertyAssignment).map((node) => node.name.text);
      return ['validateRunnerSafety', 'validateReadinessLinkage'].every((x) => names.includes(x)) &&
        ['runner', 'dryRun', 'readiness', 'runnerPath', 'dryRunPath',
          'readinessPath', 'violations'].every((x) => supplied.includes(x));
    }));
  const calls = tree.statements
    .filter((statement) => ts.isExpressionStatement(statement) &&
      ts.isCallExpression(statement.expression) &&
      ts.isIdentifier(statement.expression.expression))
    .map((statement) => statement.expression.expression.text)
    .filter((name) => name === 'validateRunnerSafety' || name === 'validateReadinessLinkage');
  const locallyDefined = tree.statements.some((statement) =>
    ts.isFunctionDeclaration(statement) &&
    ['validateRunnerSafety', 'validateReadinessLinkage'].includes(statement.name?.text));
  return { imported: !!imported, bound, calls, locallyDefined };
}

test('AST E2E admission guard catches dead binding, commented call, omitted injection, and wrong owner', () => {
  const source = readFileSync(new URL('../check-external-beta-evidence-dry-run.mjs', import.meta.url), 'utf8');
  const binding = 'const { validateRunnerSafety, validateReadinessLinkage } = createExternalBetaDryRunSafetyLinkagePolicy({\n' +
    '  runner, dryRun, readiness, runnerPath, dryRunPath, readinessPath, violations,\n});';
  assert.ok(source.includes(binding), 'real source must contain exact top-level factory injection');
  assert.deepEqual(inspectSafetyLinkageDelegation(source), {
    imported: true, bound: true,
    calls: ['validateRunnerSafety', 'validateReadinessLinkage'], locallyDefined: false,
  });
  const dead = source.replace(binding, 'function neverInvoked() {\n' + binding + '\n}');
  assert.equal(inspectSafetyLinkageDelegation(dead).bound, false);
  const omitted = source.replace(
    '  runner, dryRun, readiness, runnerPath, dryRunPath, readinessPath, violations,\n});',
    '  runner, dryRun, readiness, runnerPath, dryRunPath, violations,\n});');
  assert.equal(inspectSafetyLinkageDelegation(omitted).bound, false);
  const commented = source.replace('validateRunnerSafety();', 'void 0; // validateRunnerSafety();');
  assert.deepEqual(inspectSafetyLinkageDelegation(commented).calls, ['validateReadinessLinkage']);
  const wrongOwner = source.replace(
    "from './lib/external-beta-dry-run-safety-linkage-policy.mjs';",
    "from './lib/unrelated-policy.mjs';");
  assert.equal(inspectSafetyLinkageDelegation(wrongOwner).imported, false);
  const reversed = source.replace('validateRunnerSafety();\nvalidateReadinessLinkage();',
    'validateReadinessLinkage();\nvalidateRunnerSafety();');
  assert.deepEqual(inspectSafetyLinkageDelegation(reversed).calls,
    ['validateReadinessLinkage', 'validateRunnerSafety']);
});

function packageAdmissionFixture() {
  const f = fixture();
  f.dryRun.envExample = 'example.env';
  f.dryRun.requiredArtifactFormats = ['json'];
  f.dryRun.requiredMissingEnvWithoutCredentials = ['REPORT_ENV'];
  f.plan.uniqueMissingOptionalEnv = ['OPTIONAL_ENV'];
  f.runner.artifactExamples = [{ format: 'json' }];
  f.runner.jobs = [{ jobId: 'external', runPolicy: 'live_command',
    outputArtifacts: [{ env: 'REPORT_ENV', format: 'json' }] }];
  const dependencies = {
    ...f.dependencies,
    packageScripts: { 'check:external-beta-evidence-dry-run':
      'node scripts/check-external-beta-evidence-dry-run.mjs' },
    backendScripts: new Set(['check:external-beta-evidence-dry-run']),
    baselineScripts: new Set(['check:external-beta-evidence-dry-run']),
    baselineArtifacts: new Set(['dry-run.json']),
    packagePath: 'package.json', backendSafePath: 'backend-safe.json',
    baselinePath: 'baseline.json', readFileSync: () => 'REPORT_ENV=\nOPTIONAL_ENV=\n',
  };
  return { ...f, dependencies, ...createExternalBetaDryRunPackageAdmission(dependencies) };
}

test('real original package admission accepts complete artifact/env/baseline contracts', () => {
  const f = packageAdmissionFixture();
  f.validateArtifactCoverage();
  f.validateEnvExample();
  f.validateWiring();
  assert.deepStrictEqual(f.violations, []);
});

test('package artifact/env checks preserve exact fail-closed diagnostic ordering', () => {
  const f = packageAdmissionFixture();
  f.runner.artifactExamples = [];
  f.runner.jobs[0].outputArtifacts[0].env = 'BAD_ENV';
  f.validateArtifactCoverage();
  assert.deepStrictEqual(f.violations, [
    'runner.json: artifactExamples must include dry-run required format json',
    'dry-run.json: BAD_ENV must stay required in clean-env dry-run output',
  ]);
  const g = packageAdmissionFixture();
  createExternalBetaDryRunPackageAdmission({
    ...g.dependencies, readFileSync: () => 'REPORT_ENV=secret\n',
  }).validateEnvExample();
  assert.deepStrictEqual(g.violations, [
    'example.env: REPORT_ENV must not have a committed value',
    'example.env: must include OPTIONAL_ENV=',
  ]);
});

test('package env admission rejects whitespace and alternate nonempty assignments without exposing values', () => {
  for (const source of [
    'REPORT_ENV= synthetic\nOPTIONAL_ENV=\n',
    'REPORT_ENV=\n export REPORT_ENV=synthetic\nOPTIONAL_ENV=\n',
    'REPORT_ENV=\n REPORT_ENV = synthetic\nOPTIONAL_ENV=\n',
    'REPORT_ENV=\nREPORT_ENV: synthetic\nOPTIONAL_ENV=\n',
    'REPORT_ENV=\nREPORT_ENV=synthetic\nREPORT_ENV=\nOPTIONAL_ENV=\n',
    'REPORT_ENV=synthetic\r\nOPTIONAL_ENV=\r\n',
  ]) {
    const f = packageAdmissionFixture();
    createExternalBetaDryRunPackageAdmission({
      ...f.dependencies, readFileSync: () => source,
    }).validateEnvExample();
    assert.deepStrictEqual(f.violations, [
      'example.env: REPORT_ENV must not have a committed value',
    ]);
  }
  const f = packageAdmissionFixture();
  createExternalBetaDryRunPackageAdmission({
    ...f.dependencies, readFileSync: () => 'REPORT_ENV=\nOPTIONAL_ENV= synthetic\n',
  }).validateEnvExample();
  assert.deepStrictEqual(f.violations, [
    'example.env: OPTIONAL_ENV must not have a committed value',
  ]);
});

test('package env admission keeps empty CRLF assignments and comments valid', () => {
  const f = packageAdmissionFixture();
  createExternalBetaDryRunPackageAdmission({
    ...f.dependencies, readFileSync: () => 'REPORT_ENV= \t\r\n# REPORT_ENV=synthetic\r\nOPTIONAL_ENV=\r\n',
  }).validateEnvExample();
  assert.deepStrictEqual(f.violations, []);
});

test('package wiring diagnostics remain ordered across npm/backend/baseline owners', () => {
  const f = packageAdmissionFixture();
  f.dependencies.packageScripts['check:external-beta-evidence-dry-run'] = 'node wrong';
  f.dependencies.backendScripts.clear();
  f.dependencies.baselineScripts.clear();
  f.dependencies.baselineArtifacts.clear();
  f.validateWiring();
  assert.deepStrictEqual(f.violations, [
    'package.json: check:external-beta-evidence-dry-run must run the dry-run checker',
    'backend-safe.json: backendScripts must include check:external-beta-evidence-dry-run',
    'baseline.json: requiredGreenScripts must include check:external-beta-evidence-dry-run',
    'baseline.json: trackedArtifacts must include dry-run.json',
  ]);
});

test('package admission rejects missing/null and noncallable live dependencies', () => {
  const f = packageAdmissionFixture();
  for (const name of [
    'runner', 'dryRun', 'plan', 'runnerPath', 'dryRunPath', 'packageScripts', 'backendScripts',
    'baselineScripts', 'baselineArtifacts', 'packagePath', 'backendSafePath', 'baselinePath',
    'violations', 'readFileSync', 'assertSameSet',
  ]) {
    for (const value of [undefined, null]) {
      assert.throws(() => createExternalBetaDryRunPackageAdmission({ ...f.dependencies, [name]: value }),
        { name: 'TypeError', message: 'external beta dry-run package admission requires ' + name });
    }
  }
  for (const name of ['readFileSync', 'assertSameSet']) {
    assert.throws(() => createExternalBetaDryRunPackageAdmission({ ...f.dependencies, [name]: 1 }),
      { name: 'TypeError', message:
        'external beta dry-run package admission requires callable readFileSync and assertSameSet' });
  }
});

test('real CLI enforces extracted artifact and env checks after other policies', () => {
  const f = dryRunCliFixture();
  try {
    f.dryRun.requiredArtifactFormats = ['json'];
    f.plan.uniqueMissingOptionalEnv = ['OPTIONAL_ENV'];
    f.handoff.readiness.uniqueMissingOptionalEnv = ['OPTIONAL_ENV'];
    const result = f.run();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.deepStrictEqual(result.stderr.trimEnd().split('\n'), [
      'ops/release/external-beta-evidence-dry-run.json: requiredArtifactFormats: expected [json], got []',
      'ops/release/external-beta-evidence-runner.json: artifactExamples must include dry-run required format json',
      'ops/release/example.env: must include OPTIONAL_ENV=',
    ]);
  } finally { f.cleanup(); }
});

function realPackageWiring(source) {
  const tree = ts.createSourceFile('dry-run.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const deps = [
    'runner', 'dryRun', 'plan', 'runnerPath', 'dryRunPath', 'packageScripts', 'backendScripts',
    'baselineScripts', 'baselineArtifacts', 'packagePath', 'backendSafePath', 'baselinePath',
    'violations', 'readFileSync', 'assertSameSet',
  ];
  const imported = tree.statements.some((s) => ts.isImportDeclaration(s) &&
    s.moduleSpecifier.text === './lib/external-beta-dry-run-package-admission.mjs' &&
    ts.isNamedImports(s.importClause?.namedBindings) &&
    s.importClause.namedBindings.elements.some((e) =>
      e.name.text === 'createExternalBetaDryRunPackageAdmission' && !e.propertyName));
  const bound = tree.statements.some((s) => ts.isVariableStatement(s) &&
    s.declarationList.declarations.some((d) =>
      ts.isObjectBindingPattern(d.name) && ts.isCallExpression(d.initializer) &&
      d.initializer.expression.getText(tree) === 'createExternalBetaDryRunPackageAdmission' &&
      ['validateArtifactCoverage', 'validateEnvExample', 'validateWiring'].every((n) =>
        d.name.elements.some((e) => e.name.text === n && !e.propertyName)) &&
      d.initializer.arguments.length === 1 && ts.isObjectLiteralExpression(d.initializer.arguments[0]) &&
      deps.every((n) => d.initializer.arguments[0].properties.some((p) =>
        ts.isShorthandPropertyAssignment(p) && p.name.text === n))));
  const calls = tree.statements.filter((s) => ts.isExpressionStatement(s) &&
    ts.isCallExpression(s.expression) && ts.isIdentifier(s.expression.expression))
    .map((s) => s.expression.expression.text);
  const first = calls.indexOf('validateArtifactCoverage');
  return imported && bound && first >= 0 &&
    calls.slice(first, first + 3).join(',') === 'validateArtifactCoverage,validateEnvExample,validateWiring' &&
    calls.lastIndexOf('validateArtifactCoverage') === first;
}

test('package AST E2E guard detects commented, nested, missing-dependency and wrong-owner bypass', () => {
  const source = readFileSync(new URL('../check-external-beta-evidence-dry-run.mjs', import.meta.url), 'utf8');
  assert.equal(realPackageWiring(source), true);
  assert.equal(realPackageWiring(source.replace('validateArtifactCoverage();',
    '// validateArtifactCoverage();')), false);
  assert.equal(realPackageWiring(source.replace('validateEnvExample();',
    'function unreachable() { validateEnvExample(); }')), false);
  assert.equal(realPackageWiring(source.replace('violations, readFileSync, assertSameSet,',
    'violations, assertSameSet,')), false);
  assert.equal(realPackageWiring(source.replace(
    "from './lib/external-beta-dry-run-package-admission.mjs'",
    "from './lib/not-the-admission-policy.mjs'")), false);
});
function inspectCleanEnvRunnerBoundary(source) {
  const tree = ts.createSourceFile('dry-run.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const owner = './lib/external-beta-dry-run-clean-env-runtime.mjs';
  const imported = tree.statements.some((statement) =>
    ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === owner &&
    statement.importClause?.namedBindings &&
    ts.isNamedImports(statement.importClause.namedBindings) &&
    statement.importClause.namedBindings.elements.some((entry) =>
      !entry.propertyName && entry.name.text === 'readRunnerJsonWithCleanEnv'));
  const calls = tree.statements.filter(ts.isVariableStatement)
    .flatMap((statement) => statement.declarationList.declarations)
    .filter((declaration) => ts.isIdentifier(declaration.name) &&
      declaration.initializer && ts.isCallExpression(declaration.initializer) &&
      ts.isIdentifier(declaration.initializer.expression) &&
      declaration.initializer.expression.text === 'readRunnerJsonWithCleanEnv')
    .map((declaration) => [declaration.name.text, declaration.initializer.arguments[0]?.getText(tree)]);
  const duplicate = tree.statements.some((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === 'readRunnerJsonWithCleanEnv');
  return { imported, calls, duplicate };
}

test('clean-env subprocess I/O delegates exactly two real top-level runner operations', () => {
  const source = readFileSync(new URL('../check-external-beta-evidence-dry-run.mjs', import.meta.url), 'utf8');
  const expected = {
    imported: true, calls: [['plan', "['--plan', '--json']"], ['handoff', "['--handoff-json']"]],
    duplicate: false,
  };
  assert.deepEqual(inspectCleanEnvRunnerBoundary(source), expected);
  assert.equal(inspectCleanEnvRunnerBoundary(source.replace(
    "from './lib/external-beta-dry-run-clean-env-runtime.mjs'",
    "from './lib/unrelated-runtime.mjs'")).imported, false);
  assert.deepEqual(inspectCleanEnvRunnerBoundary(source.replace(
    "const plan = readRunnerJsonWithCleanEnv(['--plan', '--json']);",
    "function unused() { const plan = readRunnerJsonWithCleanEnv(['--plan', '--json']); }")).calls,
  [['handoff', "['--handoff-json']"]]);
});

test('real dry-run CLI scrubs parent confirmation and secret sentinel from both child invocations', () => {
  const f = dryRunCliFixture();
  try {
    const result = f.run({
      EXTERNAL_BETA_EVIDENCE_CONFIRM: 'run-live',
      EXTERNAL_BETA_SECRET_SENTINEL: 'must-not-reach-child',
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, 'External beta evidence dry-run package OK\n');
  } finally {
    f.cleanup();
  }
});
