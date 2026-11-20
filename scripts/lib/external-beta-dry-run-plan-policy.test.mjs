import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { createExternalBetaDryRunPlanPolicy } from './external-beta-dry-run-plan-policy.mjs';
import { createExternalBetaDryRunHandoffPolicy } from './external-beta-dry-run-handoff-policy.mjs';

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


// Execute the real CLI against synthetic contracts, never a live runner.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function dryRunCliFixture() {
  const root = mkdtempSync(join(tmpdir(), 'social-monitor-dry-run-e2e-'));
  mkdirSync(join(root, 'scripts', 'lib'), { recursive: true });
  mkdirSync(join(root, 'ops', 'release'), { recursive: true });
  copyFileSync(new URL('../check-external-beta-evidence-dry-run.mjs', import.meta.url),
    join(root, 'scripts', 'check-external-beta-evidence-dry-run.mjs'));
  copyFileSync(new URL('./external-beta-dry-run-plan-policy.mjs', import.meta.url),
    join(root, 'scripts', 'lib', 'external-beta-dry-run-plan-policy.mjs'));
  copyFileSync(new URL('./external-beta-dry-run-handoff-policy.mjs', import.meta.url),
    join(root, 'scripts', 'lib', 'external-beta-dry-run-handoff-policy.mjs'));
  writeFileSync(join(root, 'scripts', 'external-beta-evidence-runner.mjs'),
    "import { readFileSync } from 'node:fs';\n" +
    "const args = process.argv.slice(2).join(' ');\n" +
    "const file = args === '--plan --json' ? 'plan.json' : args === '--handoff-json' ? 'handoff.json' : null;\n" +
    "if (!file) { process.stderr.write('unexpected runner operation'); process.exit(91); }\n" +
    "process.stdout.write(readFileSync(file, 'utf8'));\n");
  const runner = {
    runnerId: 'synthetic-dry-run', jsonPlanCommand: 'node runner --plan --json',
    handoffCommand: 'node runner --handoff', handoffJsonCommand: 'node runner --handoff-json',
    summaryCommand: 'node runner --summary', preflightCommand: 'node runner --preflight',
    artifactValidationCommand: 'node runner --validate', currentPackageCommand: 'node checker',
    executionSafety: { forbiddenTargets: [] }, jobs: [], artifactExamples: [],
  };
  const dryRun = {
    schemaVersion: 1, scope: 'backend-only', frontendPolicy: 'deferred_contract_only',
    defaultMode: 'plan_only', notEvidence: true, doesNotUnblockExternalBeta: true,
    sourceRunnerContract: 'ops/release/external-beta-evidence-runner.json',
    sourceReadinessContract: 'ops/release/external-beta-readiness-contract.json',
    envExample: 'ops/release/example.env',
    planJsonCommand: runner.jsonPlanCommand, handoffCommand: runner.handoffCommand,
    handoffJsonCommand: runner.handoffJsonCommand, summaryCommand: runner.summaryCommand,
    preflightCommand: runner.preflightCommand,
    artifactValidationCommand: runner.artifactValidationCommand,
    currentPackageCommand: runner.currentPackageCommand,
    liveExecutionTemplate: 'EXTERNAL_BETA_EVIDENCE_CONFIRM=run-live node runner --execute',
    expectedPlanCountsWithoutCredentials: { jobCount: 0 },
    requiredJobIds: [], requiredMissingEnvWithoutCredentials: [],
    requiredReadinessStatesWithoutCredentials: [], requiredArtifactFormats: [], forbiddenTargets: [],
  };
  const plan = {
    runnerId: runner.runnerId, mode: 'plan_only', jobCount: 0, jobs: [],
    uniqueMissingEnv: [], uniqueMissingOptionalEnv: [], readinessCounts: {},
    localContractJobCount: 0, contractClosurePercent: 0, executableLiveJobCount: 0,
    manualArtifactReadyForValidationJobCount: 0, liveCommandJobCount: 0,
    manualArtifactJobCount: 0, externalEvidenceEnvReadinessPercent: 0,
    externalBlockerJobCount: 0, blockedMissingRequiredEnvJobCount: 0,
    blockedInvalidInputJobCount: 0, blockedLocalRuntimeEnvJobCount: 0,
  };
  const handoff = {
    runnerId: runner.runnerId, scope: dryRun.scope, frontendPolicy: dryRun.frontendPolicy,
    envTemplate: dryRun.envExample,
    inputMatrix: {
      matrixId: 'external-beta-evidence-input-matrix-v1', secretValuePolicy: 'never_commit_values',
      artifactPathPolicy: 'absolute_json_private_0600_non_workspace_non_fixture_path',
    },
    safety: {
      handoffJsonCommand: dryRun.handoffJsonCommand,
      currentPackageCommand: dryRun.currentPackageCommand, envValuePolicy: 'names_only',
      evidencePathPolicy: 'absolute_json_private_0600_non_workspace_non_fixture_path',
    },
    readiness: {
      localContractJobs: 0, totalJobs: 0, contractClosurePercent: 0,
      externalEvidenceReadyJobs: 0, externalEvidenceTotalJobs: 0,
      externalEvidenceEnvReadinessPercent: 0, externalBlockerJobCount: 0,
      blockedMissingRequiredEnvJobCount: 0, blockedInvalidInputJobCount: 0,
      blockedLocalRuntimeEnvJobCount: 0, uniqueMissingEnv: [], uniqueMissingOptionalEnv: [],
    },
    jobs: [],
  };
  const readiness = {
    externalBetaDecision: 'hold', evidenceMode: 'fixture_contract_with_external_evidence_required',
    evidenceRunner: {
      contract: 'ops/release/external-beta-evidence-runner.json',
      jsonPlanCommand: dryRun.planJsonCommand,
      handoffJsonCommand: dryRun.handoffJsonCommand,
      currentPackageCommand: dryRun.currentPackageCommand,
    },
  };
  function write(relative, value) {
    writeFileSync(join(root, relative), JSON.stringify(value));
  }
  const save = () => {
    write('ops/release/external-beta-evidence-dry-run.json', dryRun);
    write('ops/release/external-beta-evidence-runner.json', runner);
    write('ops/release/external-beta-readiness-contract.json', readiness);
    write('ops/release/backend-safe-verify-contract.json',
      { backendScripts: ['check:external-beta-evidence-dry-run'] });
    write('ops/release/release-baseline-contract.json', {
      requiredGreenScripts: ['check:external-beta-evidence-dry-run'],
      trackedArtifacts: [{ path: 'ops/release/external-beta-evidence-dry-run.json' }],
    });
    write('package.json', { scripts: {
      'check:external-beta-evidence-dry-run': 'node scripts/check-external-beta-evidence-dry-run.mjs',
    } });
    write('plan.json', plan);
    write('handoff.json', handoff);
    writeFileSync(join(root, 'ops', 'release', 'example.env'), '');
  };
  const run = () => {
    save();
    return spawnSync(process.execPath, ['scripts/check-external-beta-evidence-dry-run.mjs'], {
      cwd: root, encoding: 'utf8', timeout: 10000,
      env: { PATH: process.env.PATH ?? '' },
    });
  };
  return { runner, dryRun, plan, handoff, run, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

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
