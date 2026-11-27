import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { liveReadinessEntrypointBindings } from './external-beta-readiness-entrypoint-test-bindings.mjs';
import { validateExternalBetaContractAdmission } from './external-beta-readiness-contract-admission.mjs';
import { validateExternalBetaNpmVerification } from './external-beta-readiness-npm-verification.mjs';
import { loadExternalBetaReadinessSnapshot } from './external-beta-readiness-input-snapshot.mjs';

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


test('npm admission preserves verification through either verify or backend-safe script', () => {
  const scripts = { 'check:external-beta-readiness': 'node scripts/check-external-beta-readiness.mjs' };
  const validate = (verifyScript, backend = [], actualScripts = scripts) => {
    const violations = [];
    validateExternalBetaNpmVerification({
      scripts: actualScripts, verifyScript, backendSafeScripts: new Set(backend),
      packagePath: 'package.json', violations,
    });
    return violations;
  };
  assert.deepStrictEqual(validate('npm run check:external-beta-readiness'), []);
  assert.deepStrictEqual(validate('echo noop', ['check:external-beta-readiness']), []);
  assert.deepStrictEqual(validate('npm run check:external-beta-readiness && npm run check:other'), []);
  assert.deepStrictEqual(validate('npm run check:external-beta-readiness; npm run check:other'), []);
  assert.deepStrictEqual(validate('npm run check:external-beta-readiness -- --flag'), []);
  assert.deepStrictEqual(validate('npm run check:external-beta-readiness-extra'), [
    'package.json: npm run verify or verify:backend must include check:external-beta-readiness',
  ]);
  assert.deepStrictEqual(validate('echo noop'), [
    'package.json: npm run verify or verify:backend must include check:external-beta-readiness',
  ]);
  assert.deepStrictEqual(validate('echo noop', [], {}), [
    'package.json: missing check:external-beta-readiness',
    'package.json: npm run verify or verify:backend must include check:external-beta-readiness',
  ]);
  assert.deepStrictEqual(validate('npm run check:external-beta-readiness', [], {}), [
    'package.json: missing check:external-beta-readiness',
  ]);
});

// Guard actual module-scope delegation, not a comment or dead nested factory.
function inspectEntrypoint(source) {
  const root = ts.createSourceFile('check-external-beta-readiness.mjs',
    source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const required = ['contract', 'contractPath', 'scripts', 'existsSync', 'violations'];
  const live = liveReadinessEntrypointBindings(ts, root);
  if (!live) return false;
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
    source.replace('./lib/external-beta-readiness-input-snapshot.mjs', './lib/unrelated-snapshot.mjs'),
    source.replace('loadExternalBetaReadinessSnapshot(readFileSync)', 'loadExternalBetaReadinessSnapshot(() => "{}")'),
  ];
  for (const altered of mutations) {
    assert.notEqual(altered, source);
    assert.equal(inspectEntrypoint(altered), false);
  }
});


function inspectNpmReadinessWiring(source) {
  const tree = ts.createSourceFile('check-external-beta-readiness.mjs', source,
    ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const owner = './lib/external-beta-readiness-npm-verification.mjs';
  const name = 'validateExternalBetaNpmVerification';
  const deps = ['scripts', 'verifyScript', 'backendSafeScripts', 'packagePath', 'violations'];
  const live = liveReadinessEntrypointBindings(ts, tree);
  if (!live) return false;
  let imports = 0;
  let calls = 0;
  for (const statement of tree.statements) {
    if (ts.isImportDeclaration(statement) && ts.isNamedImports(statement.importClause?.namedBindings) &&
      statement.moduleSpecifier.text === owner) {
      imports += statement.importClause.namedBindings.elements.filter(e =>
        !e.propertyName && e.name.text === name).length;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) live.add(declaration.name.text);
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

test('real readiness entrypoint delegates npm admission; AST mutations fail closed', () => {
  const source = readFileSync(new URL('../check-external-beta-readiness.mjs', import.meta.url), 'utf8');
  const call = 'validateExternalBetaNpmVerification({ scripts, verifyScript, backendSafeScripts, packagePath, violations });';
  assert.equal(inspectNpmReadinessWiring(source), true);
  assert.ok(source.includes(call));
  for (const mutated of [
    source.replace(call, '// ' + call),
    source.replace(call, 'function dead() { ' + call + ' }'),
    source.replace(call, call.replace('backendSafeScripts, ', '')),
    source.replace('./lib/external-beta-readiness-npm-verification.mjs', './lib/other-owner.mjs'),
    source.replace('./lib/external-beta-readiness-input-snapshot.mjs', './lib/unrelated-snapshot.mjs'),
    source.replace('loadExternalBetaReadinessSnapshot(readFileSync)', 'loadExternalBetaReadinessSnapshot(() => "{}")'),
  ]) {
    assert.notEqual(mutated, source);
    assert.equal(inspectNpmReadinessWiring(mutated), false);
  }
});


function moduleLevelReadinessPolicyCalls(source) {
  const root = ts.createSourceFile('check-external-beta-readiness.mjs',
    source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return root.statements.flatMap(statement => {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) return [];
    const target = statement.expression.expression;
    return ts.isIdentifier(target) && target.text.startsWith('validateExternalBeta') ? [target.text] : [];
  });
}

test('all five live readiness policy calls preserve original top-level diagnostic order', () => {
  const source = readFileSync(new URL('../check-external-beta-readiness.mjs', import.meta.url), 'utf8');
  const expected = [
    'validateExternalBetaContractAdmission',
    'validateExternalBetaEvidenceGroups',
    'validateExternalBetaGoCrossEvidence',
    'validateExternalBetaCapacityAndExceptions',
    'validateExternalBetaNpmVerification',
  ];
  assert.deepStrictEqual(moduleLevelReadinessPolicyCalls(source), expected);
  const first = 'validateExternalBetaGoCrossEvidence({ contract, sourceCertification, feedback, decision, contractPath, violations });';
  const second = 'validateExternalBetaCapacityAndExceptions({ contract, contractPath, violations });';
  assert.ok(source.includes(first) && source.includes(second));
  const reordered = source.replace(first, '__READINESS_POLICY_SLOT__')
    .replace(second, first).replace('__READINESS_POLICY_SLOT__', second);
  assert.notEqual(reordered, source);
  assert.notDeepStrictEqual(moduleLevelReadinessPolicyCalls(reordered), expected);
});

// Exercise the actual CLI with isolated filesystem contracts, not only policy functions.
// Production evidence and deployment credentials are never read or modified.
test('readiness CLI preserves successful HOLD/GO and ordered fail-closed diagnostics end-to-end', async () => {
  const { spawnSync } = await import('node:child_process');
  const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const entrypoint = fileURLToPath(new URL('../check-external-beta-readiness.mjs', import.meta.url));
  const prefix = 'ops/release/external-beta-readiness-contract.json';
  const requiredGroups = [
    'release-baseline-freeze', 'durable-runtime-proof', 'production-auth-finalization',
    'source-provider-live-certification', 'credential-secret-runtime-flow',
    'rabbitmq-staging-reliability-drill', 'postgres-restore-migration-drill',
    'durable-backend-e2e-loop', 'summary-quality-feedback-hardening',
    'operational-support-package', 'capacity-envelope-beta-ring-decision',
    'release-artifact-evidence', 'security-final-sweep', 'no-go-cleanup',
  ];
  const criteria = [
    'durable runtime proof', 'live source provider certification',
    'credential and secret runtime flow', 'RabbitMQ and Postgres staging drills',
    'backend durable E2E loop', 'summary blocker feedback', 'security final sweep',
    'release artifact evidence', 'capacity envelope and no-go cleanup',
  ];
  const numericFields = [
    'maxUsers', 'maxTopicsPerWorkspace', 'maxEnabledSourcesPerTopic',
    'maxManualScansPerWorkspacePerHour', 'maxSummaryRequestsPerWorkspacePerHour',
    'maxQueueLagSeconds', 'maxSummaryEstimatedCostUsdPerWorkspacePerDay',
    'maxDeliveryAttemptsPerWorkspacePerHour',
  ];
  const runnerCommands = [
    'checkCommand', 'planCommand', 'jsonPlanCommand', 'summaryCommand',
    'preflightCommand', 'artifactValidationCommand',
    'dockerBundleImportCommand', 'currentPackageCommand',
  ];
  const fixture = () => ({
    contract: {
      schemaVersion: 1, scope: 'backend-only',
      frontendPolicy: 'deferred_contract_only',
      evidenceMode: 'fixture_contract_with_external_evidence_required',
      externalBetaDecision: 'hold', goDecisionExitCriteria: criteria,
      evidenceRunner: {
        contract: 'fixture-evidence.json',
        ...Object.fromEntries(runnerCommands.map(field => [field, 'npm run check:evidence'])),
      },
      requiredEvidenceGroups: requiredGroups.map(groupId => ({
        groupId, status: 'passed', blocksExternalBeta: true,
        owner: 'test-owner', verificationCommands: ['npm run check:evidence'],
        requiredArtifacts: [], exitCondition: 'verified',
      })),
      capacityEnvelope: Object.fromEntries(numericFields.map(field => [field, 1])),
      noGoExceptions: [{ exceptionId: 'must-block', blocking: true, owner: 'owner', exitCondition: 'resolved' }],
    },
    certification: { certifiedProviders: [{ liveBetaReady: true }] },
    feedback: { evidenceMode: 'redacted_beta_samples' },
    decision: { decision: 'go' },
    backendSafe: { backendScripts: [] },
    pkg: { scripts: {
      'check:evidence': 'node evidence.mjs',
      'check:external-beta-readiness': 'node scripts/check-external-beta-readiness.mjs',
      verify: 'npm run check:external-beta-readiness',
    } },
  });
  const scenarios = [
    { name: 'hold with complete evidence', mutate() {}, expected: [] },
    { name: 'go with complete evidence', mutate(f) { f.contract.externalBetaDecision = 'go'; }, expected: [] },
    { name: 'hold with pending evidence', mutate(f) { f.contract.requiredEvidenceGroups[0].status = 'hold'; }, expected: [] },
    { name: 'backend-safe admission without npm verify', mutate(f) {
      delete f.pkg.scripts.verify;
      f.backendSafe.backendScripts.push('check:external-beta-readiness');
    }, expected: [] },
    { name: 'missing both verification paths', mutate(f) {
      delete f.pkg.scripts.verify;
    }, expected: ['package.json: npm run verify or verify:backend must include check:external-beta-readiness'] },
    {
      name: 'go with unfinished external evidence',
      mutate(f) {
        f.contract.externalBetaDecision = 'go';
        f.contract.requiredEvidenceGroups[0].status = 'hold';
        f.certification.certifiedProviders[0].liveBetaReady = false;
        f.feedback.evidenceMode = 'fixture';
        f.decision.decision = 'hold';
      },
      expected: [
        `${prefix}: externalBetaDecision cannot be go while blocking evidence is not passed`,
        `${prefix}: go requires every certified provider to be liveBetaReady`,
        `${prefix}: go requires redacted beta feedback samples`,
        `${prefix}: go requires beta ring decision to be go`,
      ],
    },
    {
      name: 'malformed evidence groups and artifacts reject in legacy cross-policy order',
      mutate(f) {
        f.contract.evidenceRunner.planCommand = 'npm run missing-plan';
        const first = f.contract.requiredEvidenceGroups[0];
        first.groupId = 'foreign-evidence';
        first.status = 'unverified';
        first.owner = '';
        first.blocksExternalBeta = false;
        first.verificationCommands = ['npm run missing-check'];
        first.requiredArtifacts = ['missing-artifact'];
        first.exitCondition = '';
        f.contract.requiredEvidenceGroups[1].groupId = 'foreign-evidence';
        f.contract.capacityEnvelope.maxUsers = 0;
        f.contract.noGoExceptions[0].blocking = false;
      },
      expected: [
        prefix + ': evidenceRunner.planCommand must reference an existing npm script',
        prefix + ': unsupported evidence group "foreign-evidence"',
        prefix + ': evidence group "foreign-evidence" has unsupported status "unverified"',
        prefix + ': evidence group "foreign-evidence" must define owner',
        prefix + ': evidence group "foreign-evidence" must block external beta until passed',
        prefix + ': evidence group "foreign-evidence" references missing script "missing-check"',
        prefix + ': evidence group "foreign-evidence" references missing artifact "missing-artifact"',
        prefix + ': evidence group "foreign-evidence" must define exitCondition',
        prefix + ': duplicate evidence group "foreign-evidence"',
        prefix + ': unsupported evidence group "foreign-evidence"',
        prefix + ': missing required evidence group "release-baseline-freeze"',
        prefix + ': missing required evidence group "durable-runtime-proof"',
        prefix + ': capacityEnvelope.maxUsers must be positive',
        prefix + ': noGoException "must-block" must be blocking',
      ],
    },
    {
      name: 'all five policy owners preserve original diagnostic order in one CLI run',
      mutate(f) {
        f.contract.schemaVersion = 0;
        f.contract.externalBetaDecision = 'go';
        f.contract.requiredEvidenceGroups[0].status = 'hold';
        f.certification.certifiedProviders[0].liveBetaReady = false;
        f.feedback.evidenceMode = 'fixture';
        f.decision.decision = 'hold';
        f.contract.capacityEnvelope.maxUsers = 0;
        delete f.pkg.scripts.verify;
      },
      expected: [
        `${prefix}: schemaVersion must be 1`,
        `${prefix}: externalBetaDecision cannot be go while blocking evidence is not passed`,
        `${prefix}: go requires every certified provider to be liveBetaReady`,
        `${prefix}: go requires redacted beta feedback samples`,
        `${prefix}: go requires beta ring decision to be go`,
        `${prefix}: capacityEnvelope.maxUsers must be positive`,
        'package.json: npm run verify or verify:backend must include check:external-beta-readiness',
      ],
    },
    {
      name: 'contract/verification/capacity failures stay ordered',
      mutate(f) {
        f.contract.evidenceRunner.contract = 'nonexistent-evidence.json';
        f.contract.evidenceRunner.planCommand = 'npm run nonexistent';
        f.contract.capacityEnvelope.maxUsers = 0;
        f.contract.noGoExceptions[0].blocking = false;
        delete f.pkg.scripts['check:external-beta-readiness'];
        f.pkg.scripts.verify = 'echo no-readiness-check';
      },
      expected: [
        `${prefix}: evidenceRunner.contract must reference an existing contract`,
        `${prefix}: evidenceRunner.planCommand must reference an existing npm script`,
        `${prefix}: capacityEnvelope.maxUsers must be positive`,
        `${prefix}: noGoException "must-block" must be blocking`,
        'package.json: missing check:external-beta-readiness',
        'package.json: npm run verify or verify:backend must include check:external-beta-readiness',
      ],
    },
  ];

  for (const scenario of scenarios) {
    const root = mkdtempSync(join(tmpdir(), 'social-monitor-readiness-'));
    try {
      const f = fixture();
      scenario.mutate(f);
      const write = (path, value) => {
        const absolute = join(root, path);
        mkdirSync(dirname(absolute), { recursive: true });
        writeFileSync(absolute, JSON.stringify(value));
      };
      write('ops/release/external-beta-readiness-contract.json', f.contract);
      write('ops/ingestion/source-provider-certification.json', f.certification);
      write('ops/release/beta-feedback-classification-report.json', f.feedback);
      write('ops/release/beta-ring-expansion-decision-record.json', f.decision);
      write('ops/release/backend-safe-verify-contract.json', f.backendSafe);
      write('package.json', f.pkg);
      write('fixture-evidence.json', {});

      const run = spawnSync(process.execPath, [entrypoint], {
        cwd: root, encoding: 'utf8', timeout: 10_000,
        env: { ...process.env, NODE_ENV: 'test' },
      });
      assert.equal(run.error, undefined, `${scenario.name}: subprocess error`);
      assert.equal(run.status, scenario.expected.length ? 1 : 0, `${scenario.name}: exit ${run.stderr}`);
      assert.equal(run.stdout, scenario.expected.length ? '' : 'External beta readiness contract OK\n', scenario.name);
      assert.equal(run.stderr, scenario.expected.length ? `${scenario.expected.join('\n')}\n` : '', scenario.name);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

const snapshotReadPaths = [
  'ops/release/external-beta-readiness-contract.json',
  'ops/ingestion/source-provider-certification.json',
  'ops/release/beta-feedback-classification-report.json',
  'ops/release/beta-ring-expansion-decision-record.json',
  'package.json',
  'ops/release/backend-safe-verify-contract.json',
];
const snapshotPayloads = [
  { schemaVersion: 1 },
  { certifiedProviders: [1] },
  { evidenceMode: 'fixture' },
  { decision: 'hold' },
  { scripts: { verify: 'npm run check:external-beta-readiness' } },
  { backendScripts: ['check:external-beta-readiness'] },
];

test('readiness input I/O preserves six read paths, utf8, order and downstream values', () => {
  const reads = [];
  const snapshot = loadExternalBetaReadinessSnapshot((path, encoding) => {
    reads.push([path, encoding]);
    return JSON.stringify(snapshotPayloads[snapshotReadPaths.indexOf(path)]);
  });
  assert.deepStrictEqual(reads, snapshotReadPaths.map(path => [path, 'utf8']));
  assert.equal(snapshot.contractPath, snapshotReadPaths[0]);
  assert.equal(snapshot.packagePath, snapshotReadPaths[4]);
  for (const [key, index] of [['contract', 0], ['sourceCertification', 1],
    ['feedback', 2], ['decision', 3]]) {
    assert.deepStrictEqual(snapshot[key], snapshotPayloads[index]);
  }
  assert.deepStrictEqual(snapshot.scripts, snapshotPayloads[4].scripts);
  assert.equal(snapshot.verifyScript, 'npm run check:external-beta-readiness');
  assert.deepStrictEqual([...snapshot.backendSafeScripts], ['check:external-beta-readiness']);
});

test('readiness input I/O preserves native JSON errors and aborts before later reads', () => {
  const reads = [];
  assert.throws(() => loadExternalBetaReadinessSnapshot((path, encoding) => {
    reads.push([path, encoding]);
    return path === snapshotReadPaths[2]
      ? '{invalid json'
      : JSON.stringify(snapshotPayloads[snapshotReadPaths.indexOf(path)]);
  }), SyntaxError);
  assert.deepStrictEqual(reads, snapshotReadPaths.slice(0, 3).map(path => [path, 'utf8']));
});

test('readiness input I/O preserves omitted npm script and backend script fallbacks', () => {
  const snapshot = loadExternalBetaReadinessSnapshot(path => JSON.stringify(
    path === snapshotReadPaths[4] || path === snapshotReadPaths[5]
      ? {} : snapshotPayloads[snapshotReadPaths.indexOf(path)]));
  assert.deepStrictEqual(snapshot.scripts, {});
  assert.equal(snapshot.verifyScript, '');
  assert.deepStrictEqual([...snapshot.backendSafeScripts], []);
});

function inspectReadinessSnapshotWiring(source) {
  const root = ts.createSourceFile('check-external-beta-readiness.mjs',
    source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const fields = ['contractPath', 'packagePath', 'contract', 'sourceCertification',
    'feedback', 'decision', 'scripts', 'verifyScript', 'backendSafeScripts'];
  let imports = 0;
  let binds = 0;
  for (const statement of root.statements) {
    if (ts.isImportDeclaration(statement) &&
      statement.moduleSpecifier.text === './lib/external-beta-readiness-input-snapshot.mjs' &&
      ts.isNamedImports(statement.importClause?.namedBindings)) {
      imports += statement.importClause.namedBindings.elements.filter(e =>
        !e.propertyName && e.name.text === 'loadExternalBetaReadinessSnapshot').length;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isObjectBindingPattern(declaration.name) ||
        !ts.isCallExpression(declaration.initializer) ||
        !ts.isIdentifier(declaration.initializer.expression) ||
        declaration.initializer.expression.text !== 'loadExternalBetaReadinessSnapshot' ||
        declaration.initializer.arguments.length !== 1 ||
        !ts.isIdentifier(declaration.initializer.arguments[0]) ||
        declaration.initializer.arguments[0].text !== 'readFileSync') continue;
      const names = declaration.name.elements.map(e => e.name.text);
      if (names.length === fields.length && fields.every(name => names.includes(name))) binds++;
    }
  }
  return imports === 1 && binds === 1;
}

test('readiness input loader is one real module-scope binding, not a dead/commented call', () => {
  const source = readFileSync(new URL('../check-external-beta-readiness.mjs', import.meta.url), 'utf8');
  const binding = 'loadExternalBetaReadinessSnapshot(readFileSync);';
  assert.ok(source.includes(binding));
  assert.equal(inspectReadinessSnapshotWiring(source), true);
  for (const mutant of [
    source.replace(binding, '// ' + binding),
    source.replace(binding, 'loadExternalBetaReadinessSnapshot();'),
    source.replace(binding, 'function dead() { ' + binding + ' }'),
    source.replace('./lib/external-beta-readiness-input-snapshot.mjs', './lib/wrong-owner.mjs'),
  ]) {
    assert.notEqual(mutant, source);
    assert.equal(inspectReadinessSnapshotWiring(mutant), false);
  }
});
