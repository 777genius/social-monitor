import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createStagingReliabilityCapturePathSmokes } from './staging-reliability-capture-path-smokes.mjs';

const sources = {
  rabbit: 'scripts/capture-docker-staging-reliability-evidence.mjs',
  durable: 'scripts/capture-docker-durable-backend-e2e-loop.mjs',
};

function harness({ accepted = null, diagnostic = true, artifactExists = false, missingStatus = false } = {}) {
  const violations = [];
  const calls = [];
  const nodeProcess = { execPath: '/synthetic/node', env: { INHERITED_FLAG: 'safe' } };
  const subject = createStagingReliabilityCapturePathSmokes({
    violations,
    process: nodeProcess,
    resolve: (path) => '/workspace/' + path,
    existsSync: () => artifactExists,
    dockerStagingReliabilityCapturePath: sources.rabbit,
    dockerDurableBackendE2eCapturePath: sources.durable,
    execFileSync(binary, args, options) {
      calls.push({ binary, args, options });
      const requiredKey = [
        'RABBITMQ_STAGING_DRILL_ARTIFACT_PATH',
        'POSTGRES_RESTORE_DRILL_ARTIFACT_PATH',
        'DURABLE_BACKEND_E2E_ARTIFACT_PATH',
      ].find((key) => String(options.env[key] ?? '').includes('-workspace-output.json'));
      if (!requiredKey) throw new Error('expected a workspace artifact path fixture');
      if (accepted === requiredKey || accepted === 'all') return '';
      const error = new Error('synthetic expected rejection');
      if (!missingStatus) error.status = 1;
      error.stdout = '';
      error.stderr = diagnostic
        ? requiredKey + ' must not write release evidence into the git workspace'
        : 'synthetic unrelated error';
      throw error;
    },
  });
  return { ...subject, calls, violations, nodeProcess };
}

test('defers child execution and preserves all three original negative capture invocations', () => {
  const subject = harness();
  assert.deepEqual(subject.calls, []);
  subject.validateCaptureOutputPathGuards();
  assert.equal(subject.calls.length, 3);
  assert.deepEqual(subject.calls.map(({ args }) => args), [
    [sources.rabbit], [sources.rabbit], [sources.durable],
  ]);
  for (const { binary, options } of subject.calls) {
    assert.equal(binary, '/synthetic/node');
    assert.equal(options.encoding, 'utf8');
    assert.equal(options.stdio, 'pipe');
    assert.equal(options.env.INHERITED_FLAG, 'safe');
  }
  assert.deepEqual(subject.violations, []);
});

test('fails closed when a capture accepts a workspace output path', () => {
  const subject = harness({ accepted: 'RABBITMQ_STAGING_DRILL_ARTIFACT_PATH' });
  subject.validateCaptureOutputPathGuards();
  assert.equal(subject.calls.length, 3);
  assert.ok(subject.violations.some((message) => message.includes('must reject workspace RABBITMQ_STAGING_DRILL_ARTIFACT_PATH')));
});

test('requires the original file-policy diagnostic, not merely a failed process', () => {
  const subject = harness({ diagnostic: false });
  subject.validateCaptureOutputPathGuards();
  assert.equal(subject.violations.filter((v) => v.includes('must explain evidence path policy')).length, 3);
});

test('rejects any artifact unexpectedly created in the workspace', () => {
  const subject = harness({ artifactExists: true });
  subject.validateCaptureOutputPathGuards();
  assert.equal(subject.violations.filter((v) => v.includes('must not create')).length, 3);
});

test('keeps a failure with no numeric status as a rejection', () => {
  const subject = harness({ missingStatus: true });
  subject.validateCaptureOutputPathGuards();
  assert.deepEqual(subject.violations, []);
});

const caller = readFileSync(fileURLToPath(new URL('../check-staging-reliability-evidence.mjs', import.meta.url)), 'utf8');

function assertDelegation(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  assert.match(code, /import\s*\{\s*createStagingReliabilityCapturePathSmokes\s*\}\s*from\s*["']\.\/lib\/staging-reliability-capture-path-smokes\.mjs["']/);
  assert.match(code, /const\s*\{\s*validateCaptureOutputPathGuards\s*\}\s*=\s*createStagingReliabilityCapturePathSmokes\s*\(/);
  assert.doesNotMatch(code, /function\s+validateCaptureOutputPathGuards\s*\(/);
  const ast = ts.createSourceFile('staging-checker.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0, 'staging checker must parse');
  const topLevelCalls = ast.statements
    .filter(ts.isExpressionStatement)
    .map((statement) => statement.expression)
    .filter(ts.isCallExpression)
    .map((expression) => expression.expression)
    .filter(ts.isIdentifier)
    .map((identifier) => identifier.text);
  assert.equal(topLevelCalls.filter((name) => name === 'validateCaptureOutputPathGuards').length, 1,
    'capture guard must execute exactly once at module top level');
  assert.equal(topLevelCalls.filter((name) => name === 'validateDirectArtifactPathGuards').length, 1,
    'direct guard must execute exactly once at module top level');
  assert.ok(topLevelCalls.indexOf('validateCaptureOutputPathGuards') <
    topLevelCalls.indexOf('validateDirectArtifactPathGuards'),
    'capture smoke must run before original direct guards');
}

test('original staging checker delegates once and retains mandatory direct artifact guards', () => {
  assertDelegation(caller);
  assert.equal((caller.match(/^validateCaptureOutputPathGuards\(\);$/gm) ?? []).length, 1);
  assert.equal((caller.match(/^validateDirectArtifactPathGuards\(\);$/gm) ?? []).length, 1);
});

test('commented, dormant or removed delegations cannot satisfy the architecture gate', () => {
  for (const replacement of [
    '',
    '// validateCaptureOutputPathGuards();',
    'if (false) { validateCaptureOutputPathGuards(); }',
    'function dormant() { validateCaptureOutputPathGuards(); }',
    'if (false) {\nvalidateCaptureOutputPathGuards();\n}',
    'function dormantMultiline() {\nvalidateCaptureOutputPathGuards();\n}',
  ]) {
    assert.throws(() => assertDelegation(caller.replace('validateCaptureOutputPathGuards();\nvalidateDirectArtifactPathGuards();',
      replacement + '\nvalidateDirectArtifactPathGuards();')));
  }
});
