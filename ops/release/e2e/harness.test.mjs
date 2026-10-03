import assert from 'node:assert/strict';
import test from 'node:test';
import process from 'node:process';
import { command } from '../../../scripts/ci/release-candidate.mjs';
import { controllerDenial, requireGrammarDenial, validateReceipt, validateSshPort } from './harness.mjs';

// Pure contract regressions only; this file does not claim real Docker/SSH/PG.
const hash = c => 'sha256:' + c.repeat(64);
const source = 'c9dd4f5b903c777a6a378e3233b5353d08702424';
const candidate = { sha: source, ci_run_id: '123', archive_sha256: hash('a'),
  image_id: hash('b'), image_graph: { kind: 'oci-manifest', root_digest: hash('b'), config_digest: hash('c') } };
const baseline = hash('d');
function receipt(outcome = 'activated') {
  return { schema: 'social-monitor-release-receipt-v1', sha: source, ci_run_id: '123',
    archive_sha256: hash('a'), image_id: hash('b'), previous_image_id: baseline,
    previous_sha: 'e'.repeat(40), image_graph: candidate.image_graph, scope: ['api'],
    migration_status: 'unchanged', outcome, snapshot_before_hash: hash('f'),
    snapshot_after_hash: hash('f'), probes: outcome === 'activated'
      ? { target: true } : { target: false, previous: true } };
}

test('transport failure or driver boolean cannot substitute for exact SSH denial', () => {
  // Red trigger: an auth/timeout/transport failure or generic refused:true
  // result is counted as the controller enforcing the required refusal.
  assert.equal(controllerDenial({ exitCode: 1, stdout: '{"denied":"archive-digest"}' }, 'archive-digest'), 'archive-digest');
  for (const error of [
    { exitCode: 255, stdout: '{"denied":"archive-digest"}' },
    { exitCode: null, stdout: '{"denied":"archive-digest"}' },
    { exitCode: 0, stdout: '{"denied":"archive-digest"}' },
    { exitCode: 1, stdout: '{"refused":true}' },
    { exitCode: 1, stdout: '{"denied":"invalid-host-state"}' },
    { exitCode: 1, stdout: '{"denied":"archive-digest","untrusted":true}' },
    { exitCode: 1, stdout: '' },
  ]) assert.throws(() => controllerDenial(error, 'archive-digest'));
});

test('terminal receipts bind exact candidate, baseline, scope and observed preservation', () => {
  // Red trigger: ready container output alone is accepted despite absent,
  // unrelated or migration-changing terminal controller evidence.
  assert.equal(validateReceipt(receipt(), candidate, baseline, 'activated').outcome, 'activated');
  assert.equal(validateReceipt(receipt('rolled-back'), candidate, baseline, 'rolled-back').outcome, 'rolled-back');
  for (const mutate of [
    r => { r.schema = 'other'; },
    r => { r.sha = '0'.repeat(40); },
    r => { r.ci_run_id = '124'; },
    r => { r.archive_sha256 = hash('0'); },
    r => { r.image_id = hash('0'); },
    r => { r.previous_image_id = hash('0'); },
    r => { r.previous_sha = 'short'; },
    r => { r.image_graph = { kind: 'oci-index' }; },
    r => { r.scope = ['api', 'social-x-collector']; },
    r => { r.migration_status = 'changed'; },
    r => { r.outcome = 'rolled-back'; },
    r => { r.snapshot_after_hash = hash('0'); },
    r => { r.probes = { target: false }; },
  ]) {
    const value = receipt(); mutate(value);
    assert.throws(() => validateReceipt(value, candidate, baseline, 'activated'));
  }
  assert.throws(() => validateReceipt(receipt(), candidate, baseline, 'unknown'));
});

test('SSH endpoint must be the owned project container before any remote verb', () => {
  // Red trigger: a provisioner points the harness at an unrelated localhost
  // SSH server while a correctly labeled disposable container exists elsewhere.
  const project = 'sm-rc-e2e-synthetic';
  const model = () => ({ Config: { Labels: { 'com.docker.compose.project': project,
    'com.docker.compose.service': 'ssh' } }, NetworkSettings: { Ports: {
    '22/tcp': [{ HostIp: '127.0.0.1', HostPort: '22345' }] } } });
  validateSshPort(model(), project, 22345);
  for (const mutate of [
    m => { m.Config.Labels['com.docker.compose.project'] = 'other'; },
    m => { m.Config.Labels['com.docker.compose.service'] = 'api'; },
    m => { m.NetworkSettings.Ports['22/tcp'][0].HostIp = '0.0.0.0'; },
    m => { m.NetworkSettings.Ports['22/tcp'][0].HostPort = '22346'; },
    m => { m.NetworkSettings.Ports = {}; },
  ]) {
    const value = model(); mutate(value);
    assert.throws(() => validateSshPort(value, project, 22345));
  }
});


test('unknown SSH verb requires exit 1 and exact grammar denial, not a transport failure', async () => {
  // Real subprocess exit/stdout behavior, with synthetic responses only. This
  // regression exercises the same assertion used by the unknown-verb probe;
  // it does not claim a real SSH server was contacted.
  const response = (exitCode, stdout) => () => command(process.execPath, ['-e',
    'process.stdout.write(' + JSON.stringify(stdout) + ');process.exit(' + exitCode + ')']);
  await requireGrammarDenial(response(1, '{"denied":"grammar"}\n'));
  for (const [exitCode, stdout] of [
    [255, ''], [255, '{"denied":"grammar"}'], [0, '{"denied":"grammar"}'],
    [1, ''], [1, 'malformed'], [1, '{"denied":"invalid-host-state"}'],
    [1, '{"denied":"grammar","extra":true}'],
  ]) await assert.rejects(requireGrammarDenial(response(exitCode, stdout)));
});
