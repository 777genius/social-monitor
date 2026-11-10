import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { buildExternalBetaHandoff } from '../lib/external-beta-evidence-handoff.mjs';

const source = readFileSync(new URL('../external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
const bindings = [
  'contract', 'inputMatrix', 'evidencePathMaxBytes', 'handoffRunner',
  'handoffAction', 'hasEnv', 'inputMetadataByEnv',
  'artifactExamplePathByFormat', 'requiredEnvAlternativeCoveredEnvNames',
];

function dependencies(hasEnv = () => false) {
  return {
    contract: {
      runnerId: 'test-runner', scope: 'safe', frontendPolicy: 'not-live',
      defaultMode: 'plan', envExample: '.env.example', planCommand: 'plan',
      summaryCommand: 'summary', handoffCommand: 'handoff', handoffJsonCommand: 'handoff-json',
      preflightCommand: 'preflight', artifactValidationCommand: 'validate',
      dockerBundleImportCommand: 'docker-import', currentPackageCommand: 'package',
      executionSafety: {
        envFileArg: '--env-file', envFileConflictPolicy: 'fail',
        liveExecutionRequires: ['confirmation'],
      },
    },
    inputMatrix: {
      matrixId: 'test-matrix', checkCommand: 'check',
      secretValuePolicy: 'never-print', artifactPathPolicy: 'private-only',
    },
    evidencePathMaxBytes: () => 1024,
    handoffRunner: (job) => 'runner:' + job.jobId,
    handoffAction: (job) => 'action:' + job.jobId,
    hasEnv,
    inputMetadataByEnv: () => new Map([
      ['TOKEN', { inputClass: 'secret_ref', description: 'reference only' }],
      ['OPTION', { inputClass: 'optional' }],
    ]),
    artifactExamplePathByFormat: () => new Map([['json', '/private/evidence.json']]),
    requiredEnvAlternativeCoveredEnvNames: (alternative) => alternative.coversEnv,
  };
}

function samplePlan() {
  return {
    localContractJobCount: 1, jobCount: 2, contractClosurePercent: 50,
    executableLiveJobCount: 0, liveArtifactReadyForValidationJobCount: 1,
    manualArtifactReadyForValidationJobCount: 0,
    liveCommandJobCount: 1, manualArtifactJobCount: 1,
    externalEvidenceEnvReadinessPercent: 50, externalBlockerJobCount: 1,
    blockedMissingRequiredEnvJobCount: 1, blockedInvalidInputJobCount: 0,
    blockedLocalRuntimeEnvJobCount: 0, readinessCounts: { blocked: 1 },
    uniqueMissingEnv: ['TOKEN'], uniqueMissingOptionalEnv: ['OPTION'],
    jobs: [{
      jobId: 'test-job', evidenceGroupId: 'group', mode: 'manual',
      runPolicy: 'manual_artifact_then_validator', owner: 'operator',
      blocksExternalBeta: true, executionReadiness: 'blocked_missing_required_env',
      runnerCommand: 'safe-command', validationCommands: ['verify'],
      requiredEnv: ['TOKEN'], requiredEnvAlternatives: [{
        label: 'alternative', env: ['OPTION'], coversEnv: ['TOKEN'],
      }],
      optionalEnv: ['OPTION'], missingEnv: ['TOKEN'], missingOptionalEnv: ['OPTION'],
      preflightViolations: ['missing TOKEN'],
      outputArtifacts: [{
        env: 'TOKEN', format: 'json', expectedArtifactId: 'artifact-id',
        expectedProviderKeys: ['source'],
      }],
      exitCondition: 'verified',
    }],
  };
}

test('JSON handoff keeps original closure, safety, inputs and artifact contract shape', () => {
  const actual = buildExternalBetaHandoff(samplePlan(), dependencies());
  assert.equal(actual.runnerId, 'test-runner');
  assert.equal(actual.inputMatrix.matrixId, 'test-matrix');
  assert.equal(actual.safety.envValuePolicy, 'names_only');
  assert.equal(actual.safety.evidencePathMaxBytes, 1024);
  assert.equal(actual.readiness.externalEvidenceReadyJobs, 1);
  assert.equal(actual.readiness.externalEvidenceTotalJobs, 2);
  assert.equal(actual.readiness.blockedMissingRequiredEnvJobCount, 1);
  assert.equal(actual.jobs.length, 1);
  const job = actual.jobs[0];
  assert.equal(job.runnerDescription, 'runner:test-job');
  assert.equal(job.operatorAction, 'action:test-job');
  assert.deepEqual(job.requiredInputs[0], {
    env: 'TOKEN', inputClass: 'secret_ref', description: 'reference only',
    missing: true, artifacts: [{
      format: 'json', examplePath: '/private/evidence.json',
      expectedArtifactId: 'artifact-id', expectedProviderKeys: ['source'],
    }],
  });
  assert.deepEqual(job.requiredAlternativeInputs[0].coversEnv, ['TOKEN']);
  assert.deepEqual(job.requiredAlternativeInputs[0].inputs.map((entry) => entry.missing), [true]);
  assert.deepEqual(job.outputArtifacts[0], {
    path: null, env: 'TOKEN', location: '<env:TOKEN>',
    format: 'json', examplePath: '/private/evidence.json',
    expectedArtifactId: 'artifact-id', expectedProviderKeys: ['source'],
  });
  assert.equal(JSON.stringify(actual).includes('undefined'), false);
});

test('alternative env satisfaction is evaluated on each invocation, never cached', () => {
  let available = false;
  const deps = dependencies(() => available);
  assert.equal(buildExternalBetaHandoff(samplePlan(), deps).jobs[0].requiredAlternativeInputs[0].inputs[0].missing, true);
  available = true;
  assert.equal(buildExternalBetaHandoff(samplePlan(), deps).jobs[0].requiredAlternativeInputs[0].inputs[0].missing, false);
});

function assertDirectHandoffDelegation(text) {
  const ast = ts.createSourceFile('external-beta-evidence-runner.mjs', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0);
  const imports = ast.statements.filter(node => ts.isImportDeclaration(node)
    && node.moduleSpecifier.text === './lib/external-beta-evidence-handoff.mjs');
  assert.equal(imports.length, 1);
  assert.deepEqual(imports[0].importClause.namedBindings.elements.map(e => e.name.text), ['buildExternalBetaHandoff']);
  assert.equal(ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'buildHandoff').length, 0);
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'printJsonHandoff');
  assert.equal(functions.length, 1);
  assert.equal(functions[0].body.statements.length, 1);
  const statement = functions[0].body.statements[0];
  assert.ok(ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression));
  assert.equal(statement.expression.expression.getText(ast), 'writeStdout');
  const template = statement.expression.arguments[0];
  assert.ok(ts.isTemplateExpression(template) && template.templateSpans.length === 1);
  const stringify = template.templateSpans[0].expression;
  assert.ok(ts.isCallExpression(stringify));
  assert.equal(stringify.expression.getText(ast), 'JSON.stringify');
  assert.deepEqual(stringify.arguments.slice(1).map(a => a.getText(ast)), ['null', '2']);
  const builder = stringify.arguments[0];
  assert.ok(ts.isCallExpression(builder));
  assert.equal(builder.expression.getText(ast), 'buildExternalBetaHandoff');
  assert.equal(builder.arguments.length, 2);
  assert.equal(builder.arguments[0].getText(ast), 'plan');
  assert.ok(ts.isObjectLiteralExpression(builder.arguments[1]));
  assert.deepEqual(builder.arguments[1].properties.map(p => p.name.text), bindings);
  for (const prop of builder.arguments[1].properties) {
    assert.ok(ts.isShorthandPropertyAssignment(prop), 'pass actual original CLI bindings');
  }
}

test('CLI must directly map JSON handoff using the original dependencies', () => {
  assertDirectHandoffDelegation(source);
});

test('dormant, forged, or detached JSON handoff mappings fail the structural gate', () => {
  const anchor = 'buildExternalBetaHandoff(plan, {';
  const imp = "import { buildExternalBetaHandoff } from './lib/external-beta-evidence-handoff.mjs';";
  assert.ok(source.includes(anchor) && source.includes(imp));
  for (const altered of [
    source.replace(imp, ''),
    source.replace(anchor, 'buildExternalBetaHandoff([], {'),
    source.replace(anchor, 'buildExternalBetaHandoff(plan, { contract: { runnerId: "forged" },'),
    source.replace('  writeStdout(' + '$' + '{JSON.stringify(buildExternalBetaHandoff',
      '  if (false) writeStdout(' + '$' + '{JSON.stringify(buildExternalBetaHandoff'),
  ]) assert.throws(() => assertDirectHandoffDelegation(altered));
});
