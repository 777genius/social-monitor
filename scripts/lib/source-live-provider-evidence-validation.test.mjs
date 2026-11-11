import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { createSourceLiveProviderEvidenceValidator } from './source-live-provider-evidence-validation.mjs';

function pendingProvider() {
  return {
    providerKey: 'github', status: 'pending_live_evidence',
    requiredForExternalBeta: true, owner: 'ops', liveSmokeCommand: 'npm run check:github',
    stagingArtifactPath: null, environmentId: null, imageDigest: null, commitSha: null,
    sampledAt: null, exitCondition: 'approve on real evidence',
    signals: [{ signalId: 'http', status: 'pending_live_evidence', requiredSignal: 'live 200 response' }],
  };
}

function verify({ providers = [pendingProvider()], externalBetaStatus = 'hold_until_live_provider_evidence' } = {}) {
  const violations = [];
  const commands = [];
  const checkedPaths = [];
  const artifacts = [];
  const trace = [];
  const { validateLiveProviderEvidence } = createSourceLiveProviderEvidenceValidator({
    evidence: { liveProviderEvidence: providers, externalBetaStatus },
    evidencePath: 'pinned-evidence.json',
    violations,
    requiredProviderSignals: new Map([['github', new Set(['http'])]]),
    liveStatusValues: new Set(['pending_live_evidence', 'passed']),
    expectedLiveCommands: new Map([['github', 'npm run check:github']]),
    validateCommand: (command, label) => {
      commands.push([command, label]);
      trace.push(['command', command, label]);
    },
    requireExistingPath: (path, label) => {
      checkedPaths.push([path, label]);
      trace.push(['path', path, label]);
    },
    validatePassedProviderArtifact: (provider) => {
      artifacts.push(provider);
      trace.push(['artifact', provider.providerKey]);
    },
  });
  validateLiveProviderEvidence();
  return { violations, commands, checkedPaths, artifacts, trace };
}

test('pending provider retains original allowed schema and validation time', () => {
  const result = verify();
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.trace, [
    ['command', 'npm run check:github', 'provider "github" liveSmokeCommand'],
  ]);
  assert.deepEqual(result.checkedPaths, []);
  assert.deepEqual(result.artifacts, []);
});

test('duplicate, unsupported, and missing live providers fail closed', () => {
  assert.deepEqual(verify({ providers: [pendingProvider(), pendingProvider()] }).violations, [
    'pinned-evidence.json: duplicate live provider "github"',
  ]);
  assert.ok(verify({ providers: [{ ...pendingProvider(), providerKey: 'unknown' }] }).violations
    .some(value => value.includes('unsupported live provider')));
  assert.deepEqual(verify({ providers: [] }).violations, [
    'pinned-evidence.json: missing live provider "github"',
  ]);
  assert.ok(verify({ providers: [{ ...pendingProvider(), providerKey: 'fake-source' }] }).violations
    .some(value => value.includes('fake-source must not be')));
});

test('pending fields and provider status cannot silently become passed', () => {
  assert.deepEqual(verify({ providers: [{ ...pendingProvider(), imageDigest: 'sha256:x' }] }).violations, [
    'pinned-evidence.json: pending provider "github" must keep imageDigest=null',
  ]);
  assert.deepEqual(verify({ externalBetaStatus: 'passed' }).violations, [
    'pinned-evidence.json: externalBetaStatus cannot be passed while a provider is pending',
  ]);
  assert.ok(verify({ providers: [{ ...pendingProvider(), status: 'unknown' }] }).violations
    .some(value => value.includes('unsupported status')));
});

test('signal identity, status, and mandatory requiredSignal remain enforced', () => {
  const base = pendingProvider();
  assert.ok(verify({ providers: [{ ...base, signals: [base.signals[0], base.signals[0]] }] }).violations
    .some(value => value.includes('duplicate signal')));
  assert.ok(verify({ providers: [{ ...base, signals: [] }] }).violations
    .some(value => value.includes('missing signal')));
  assert.ok(verify({ providers: [{ ...base, signals: [{ ...base.signals[0], status: 'passed' }] }] }).violations
    .some(value => value.includes('must keep signal')));
  assert.ok(verify({ providers: [{ ...base, signals: [{ ...base.signals[0], requiredSignal: '' }] }] }).violations
    .some(value => value.includes('must define requiredSignal')));
});

test('passed provider still validates immutable fields and delegates artifact checks', () => {
  const base = pendingProvider();
  const passed = {
    ...base, status: 'passed', stagingArtifactPath: '/tmp/pinned-evidence.json',
    environmentId: 'stage', imageDigest: 'sha256:' + 'a'.repeat(64), commitSha: 'b'.repeat(40),
    sampledAt: '2026-11-11T12:00:00Z',
    signals: [{ ...base.signals[0], status: 'passed' }],
  };
  const good = verify({ providers: [passed], externalBetaStatus: 'passed' });
  assert.deepEqual(good.violations, []);
  assert.deepEqual(good.trace, [
    ['command', 'npm run check:github', 'provider "github" liveSmokeCommand'],
    ['path', '/tmp/pinned-evidence.json', 'provider "github" stagingArtifactPath'],
    ['artifact', 'github'],
  ]);
  assert.equal(good.artifacts[0], passed);
  assert.deepEqual(verify({ providers: [{ ...passed, commitSha: 'short' }] }).violations, [
    'pinned-evidence.json: passed provider "github" must define full commitSha',
  ]);
});

const checker = readFileSync(new URL('../check-source-live-certification-evidence.mjs', import.meta.url), 'utf8');
function assertDirectActiveDelegation(content) {
  const ast = ts.createSourceFile('checker.mjs', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0);
  const name = 'validateLiveProviderEvidence';
  const calls = ast.statements.filter(node => ts.isExpressionStatement(node) &&
    ts.isCallExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === name);
  assert.equal(calls.length, 1, 'one active top-level validation call');
  assert.equal(ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name).length,
    0, 'no duplicate legacy implementation');
  assert.ok(content.includes("import { createSourceLiveProviderEvidenceValidator } from './lib/source-live-provider-evidence-validation.mjs';"));
  assert.ok(content.includes('const { validateLiveProviderEvidence } = createSourceLiveProviderEvidenceValidator({'));
}
test('checker retains one real top-level provider evidence delegation', () => {
  assertDirectActiveDelegation(checker);
  assert.ok(checker.indexOf('validateSignalEvidenceSchemaMap();') <
    checker.indexOf('validateLiveProviderEvidence();'), 'preserve original call sequence');
});
test('commented, dormant, duplicate or deleted delegation fails structural gate', () => {
  const call = 'validateLiveProviderEvidence();';
  assert.equal(checker.split(call).length, 2);
  for (const altered of [
    checker.replace(call, ''),
    checker.replace(call, '// ' + call),
    checker.replace(call, 'if (false) { ' + call + ' }'),
    checker.replace(call, call + '\n' + call),
  ]) assert.throws(() => assertDirectActiveDelegation(altered));
});
