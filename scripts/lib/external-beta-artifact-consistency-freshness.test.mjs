import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { createExternalBetaArtifactConsistencyFreshness } from './external-beta-artifact-consistency-freshness.mjs';

const baselineTime = Date.parse('2026-11-11T12:00:00.000Z');
const freshness = {
  timestampPaths: ['metadata.completedAt'],
  requiredTimestampFormats: ['json'],
  maxArtifactAgeHours: 24,
  maxArtifactFutureSkewMinutes: 5,
  requiresIso8601Timestamp: true,
};

function fixture({ env = {}, policy = freshness, time = baselineTime } = {}) {
  const clock = { now: () => time };
  const process = { env };
  const contract = { artifactFreshness: policy };
  return { ...createExternalBetaArtifactConsistencyFreshness({ contract, process, Date: clock }), env, clock, contract };
}

function freshnessViolations(content, options = {}) {
  const { validateArtifactFreshness } = fixture(options);
  const violations = [];
  validateArtifactFreshness(content, { jobId: 'beta-job' }, 'ARTIFACT_PATH', 'json', violations);
  return violations;
}

test('policy factory is lazy and has exactly two public validators', () => {
  const bomb = new Proxy({}, { get: () => { throw new Error('eager policy read'); } });
  const validators = createExternalBetaArtifactConsistencyFreshness({
    contract: bomb, process: bomb, Date: bomb,
  });
  assert.deepEqual(Object.keys(validators), ['validateArtifactEnvConsistency', 'validateArtifactFreshness']);
});

test('required artifact environment identity must match, and reads remain late-bound', () => {
  const env = { STAGING_ENVIRONMENT_ID: 'stage-a' };
  const { validateArtifactEnvConsistency } = fixture({ env });
  const job = { jobId: 'beta-job', requiredEnv: ['STAGING_ENVIRONMENT_ID'] };
  const violations = [];
  validateArtifactEnvConsistency({ environmentId: 'stage-a' }, job, 'ARTIFACT_PATH', violations);
  assert.deepEqual(violations, []);
  env.STAGING_ENVIRONMENT_ID = 'stage-b';
  validateArtifactEnvConsistency({ environmentId: 'stage-a' }, job, 'ARTIFACT_PATH', violations);
  assert.deepEqual(violations, ['beta-job: output artifact env ARTIFACT_PATH environmentId must match STAGING_ENVIRONMENT_ID']);
  delete env.STAGING_ENVIRONMENT_ID;
  violations.length = 0;
  validateArtifactEnvConsistency({ environmentId: 'stage-a' }, job, 'ARTIFACT_PATH', violations);
  assert.deepEqual(violations, []);
});

test('Reddit lifecycle artifact keeps the original digest and commit exemption', () => {
  const env = { BACKEND_IMAGE_DIGEST: 'sha256:expected', BACKEND_GIT_COMMIT_SHA: 'expected' };
  const { validateArtifactEnvConsistency } = fixture({ env });
  const job = { jobId: 'reddit', requiredEnv: Object.keys(env) };
  const content = { imageDigest: 'sha256:other', commitSha: 'other' };
  const excluded = [];
  validateArtifactEnvConsistency(content, job, 'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH', excluded);
  assert.deepEqual(excluded, []);
  const ordinary = [];
  validateArtifactEnvConsistency(content, job, 'ARTIFACT_PATH', ordinary);
  assert.equal(ordinary.length, 2);
});

test('fresh required ISO timestamp passes; missing required timestamp fails closed', () => {
  assert.deepEqual(freshnessViolations({ metadata: { completedAt: new Date(baselineTime - 60000).toISOString() } }), []);
  assert.deepEqual(freshnessViolations({}), [
    'beta-job: output artifact env ARTIFACT_PATH must include a release evidence timestamp',
  ]);
  const optional = fixture({ policy: { ...freshness, requiredTimestampFormats: [] } });
  const violations = [];
  optional.validateArtifactFreshness({}, { jobId: 'beta-job' }, 'ARTIFACT_PATH', 'json', violations);
  assert.deepEqual(violations, []);
});

test('malformed, future and stale timestamp values preserve precise rejection', () => {
  const value = completedAt => ({ metadata: { completedAt } });
  assert.ok(freshnessViolations(value('not-an-ISO-time')).some(m => m.includes('must be ISO-8601')));
  assert.ok(freshnessViolations(value(new Date(baselineTime + 60 * 60000).toISOString()))
    .some(m => m.includes('must not be in the future')));
  assert.ok(freshnessViolations(value(new Date(baselineTime - 48 * 3600000).toISOString()))
    .some(m => m.includes('is older than 24 hours')));
});

test('invalid freshness bounds remain fail-closed', () => {
  const violations = freshnessViolations({ metadata: { completedAt: new Date(baselineTime).toISOString() } }, {
    policy: { ...freshness, maxArtifactAgeHours: 0 },
  });
  assert.deepEqual(violations, ['beta-job: artifact freshness policy is invalid']);
});

const runnerSource = readFileSync(new URL('../external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
function assertActiveDelegation(source) {
  const ast = ts.createSourceFile('external-beta-evidence-runner.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.deepEqual(ast.parseDiagnostics, []);
  const imports = ast.statements.filter(statement => ts.isImportDeclaration(statement)
    && statement.moduleSpecifier.text === './lib/external-beta-artifact-consistency-freshness.mjs');
  assert.equal(imports.length, 1);
  const factories = ast.statements.filter(ts.isVariableStatement)
    .flatMap(statement => statement.declarationList.declarations)
    .filter(declaration => ts.isCallExpression(declaration.initializer)
      && declaration.initializer.expression.getText(ast) === 'createExternalBetaArtifactConsistencyFreshness');
  assert.equal(factories.length, 1);
  assert.equal(factories[0].initializer.arguments[0].getText(ast), '{ contract, process, Date }');
  assert.deepEqual(factories[0].name.elements.map(e => e.name.getText(ast)),
    ['validateArtifactEnvConsistency', 'validateArtifactFreshness']);
  for (const name of ['validateArtifactEnvConsistency', 'validateArtifactFreshness']) {
    assert.equal(ast.statements.filter(ts.isFunctionDeclaration).filter(statement => statement.name?.text === name).length, 0);
    assert.equal(source.split(name + '(content, job, artifact.env, ').length, 2);
  }
}

test('original runner delegates exactly once to the live extracted factory', () => {
  assertActiveDelegation(runnerSource);
});

test('missing or inert factory binding is rejected by structural gate', () => {
  const importLine = "import { createExternalBetaArtifactConsistencyFreshness } from './lib/external-beta-artifact-consistency-freshness.mjs';\n";
  assert.throws(() => assertActiveDelegation(runnerSource.replace(importLine, '')));
  assert.throws(() => assertActiveDelegation(runnerSource.replace(
    'createExternalBetaArtifactConsistencyFreshness({ contract, process, Date })',
    'createExternalBetaArtifactConsistencyFreshness({ contract: {}, process, Date })',
  )));
});
