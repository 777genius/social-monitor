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
  const { validateLiveProviderEvidence } = createSourceLiveProviderEvidenceValidator({
    evidence: { liveProviderEvidence: providers, externalBetaStatus },
    evidencePath: 'pinned-evidence.json',
    violations,
    requiredProviderSignals: new Map([['github', new Set(['http'])]]),
    liveStatusValues: new Set(['pending_live_evidence', 'passed']),
    expectedLiveCommands: new Map([['github', 'npm run check:github']]),
    validateCommand: (command, label) => commands.push([command, label]),
    requireExistingPath: (path, label) => checkedPaths.push([path, label]),
    validatePassedProviderArtifact: (provider) => artifacts.push(provider),
  });
  validateLiveProviderEvidence();
  return { violations, commands, checkedPaths, artifacts };
}

test('pending provider retains original allowed schema and validation time', () => {
  const result = verify();
  assert.deepEqual(result.violations, []);
  assert.equal(result.commands.length, 1);
  assert.deepEqual(result.checkedPaths, []);
  assert.deepEqual(result.artifacts, []);
});

test('duplicate, unsupported, and missing live providers fail closed', () => {
  assert.ok(verify({ providers: [pendingProvider(), pendingProvider()] }).violations
    .some(value => value.includes('duplicate live provider')));
  assert.ok(verify({ providers: [{ ...pendingProvider(), providerKey: 'unknown' }] }).violations
    .some(value => value.includes('unsupported live provider')));
  assert.ok(verify({ providers: [] }).violations
    .some(value => value.includes('missing live provider')));
  assert.ok(verify({ providers: [{ ...pendingProvider(), providerKey: 'fake-source' }] }).violations
    .some(value => value.includes('fake-source must not be')));
});

test('pending fields and provider status cannot silently become passed', () => {
  assert.ok(verify({ providers: [{ ...pendingProvider(), imageDigest: 'sha256:x' }] }).violations
    .some(value => value.includes('must keep imageDigest=null')));
  assert.ok(verify({ externalBetaStatus: 'passed' }).violations
    .some(value => value.includes('cannot be passed while a provider is pending')));
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
  assert.equal(good.checkedPaths.length, 1);
  assert.equal(good.artifacts.length, 1);
  assert.equal(good.artifacts[0], passed);
  assert.ok(verify({ providers: [{ ...passed, commitSha: 'short' }] }).violations
    .some(value => value.includes('must define full commitSha')));
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
