import assert from 'node:assert/strict';
import test from 'node:test';
import { createExternalBetaJobRequirementsPolicy } from './external-beta-job-requirements-policy.mjs';

function fixture(options = {}) {
  const violations = [];
  const commands = [];
  const job = {
    jobId: 'live-source', evidenceGroupId: 'live-group', requirementId: 'live-requirement',
    mode: 'live_network', runPolicy: 'live_command', owner: 'operator',
    exitCondition: 'verified', blocksExternalBeta: true,
    validationCommands: ['npm run check:source'], runnerCommand: 'npm run run:source',
    requiredEnv: ['API_KEY'], requiredEnvAlternatives: [], optionalEnv: [],
  };
  const contract = { jobs: [job], envExample: 'fixtures/external-beta.example' };
  const context = {
    violations, contract, contractPath: 'fixtures/contract.json',
    envExampleSource: options.envExampleSource ?? 'EXTERNAL_BETA_EVIDENCE_CONFIRM=\nAPI_KEY=\n',
    allowedModes: new Set(['local_contract', 'live_network', 'staging_artifact']),
    allowedRunPolicies: new Set(['live_command', 'local_contract', 'manual_artifact_then_validator']),
    externalGroups: new Map([['live-group', { owner: 'operator' }]]),
    auditRequirements: new Map([['live-requirement', { externalReadinessGroupId: 'live-group' }]]),
    backendScripts: new Set(['run:backend-safe']),
    forbiddenFragments: ['frontend', 'flutter', 'agent-runtime'],
    validateCommand: (command, label) => {
      commands.push({ command, label });
      if (!String(command).startsWith('npm run ')) {
        violations.push(label + ': command must use npm run');
      }
    },
    scriptNameFromCommand: (command) => /^npm run (?:--silent )?([^ ]+)/.exec(String(command ?? ''))?.[1] ?? null,
  };
  return { job, contract, violations, commands, context,
    policy: createExternalBetaJobRequirementsPolicy(context) };
}

function messagesAfter(jobAction, policyMethod) {
  const f = fixture();
  jobAction(f.job, f);
  f.policy[policyMethod](f.job, 'job');
  return f.violations;
}

test('accepted job and env-example contracts retain all five validations', () => {
  const f = fixture();
  f.policy.validateJobBasics(f.job, 'job');
  f.policy.validateJobCommands(f.job, 'job');
  f.policy.validateJobEnvironment(f.job, 'job');
  f.policy.validateJobScopeSafety(f.job, 'job');
  f.policy.validateEnvExample();
  assert.deepEqual(f.violations, []);
  assert.deepEqual(f.commands.map(x => x.command), ['npm run check:source', 'npm run run:source']);
});

test('missing required identity is rejected', () => {
  assert.ok(messagesAfter(job => { job.jobId = ' '; }, 'validateJobBasics')
    .includes('job: jobId must be a non-empty string'));
});
test('unsupported evidence modes fail closed', () => {
  assert.ok(messagesAfter(job => { job.mode = 'unknown'; }, 'validateJobBasics')
    .includes('job: unsupported mode "unknown"'));
});
test('unsupported run policies fail closed', () => {
  assert.ok(messagesAfter(job => { job.runPolicy = 'unknown'; }, 'validateJobBasics')
    .includes('job: unsupported runPolicy "unknown"'));
});
test('blocksExternalBeta must explicitly remain true', () => {
  assert.ok(messagesAfter(job => { job.blocksExternalBeta = false; }, 'validateJobBasics')
    .includes('job: blocksExternalBeta must be true'));
});
test('optional description cannot be an empty string', () => {
  assert.ok(messagesAfter(job => { job.operatorAction = ''; }, 'validateJobBasics')
    .includes('job: operatorAction must be a non-empty string when set'));
});
test('real feedback import retains explicit source-export trace', () => {
  const f = fixture();
  f.job.jobId = 'summary-real-feedback-import';
  f.policy.validateJobBasics(f.job, 'job');
  assert.deepEqual(f.violations, [
    'job: runnerDescription must reference export:summary-feedback-samples',
    'job: operatorAction must reference export:summary-feedback-samples',
    'job: exitCondition must reference export:summary-feedback-samples',
  ]);
});
test('unknown group and owner mismatch cannot pass readiness validation', () => {
  const a = messagesAfter(job => { job.evidenceGroupId = 'nonexistent'; }, 'validateJobBasics');
  assert.ok(a.includes('job: evidenceGroupId must reference external beta readiness group'));
  const b = messagesAfter(job => { job.owner = 'different'; }, 'validateJobBasics');
  assert.ok(b.includes('job: owner must match external readiness group owner "operator"'));
});
test('audit requirement must map to exact evidence group', () => {
  const f = fixture();
  f.context.auditRequirements.set('live-requirement', { externalReadinessGroupId: 'different' });
  f.policy.validateJobBasics(f.job, 'job');
  assert.deepEqual(f.violations, ['job: requirementId must map to evidenceGroupId "live-group"']);
});
test('validationCommands list may not be empty', () => {
  assert.ok(messagesAfter(job => { job.validationCommands = []; }, 'validateJobCommands')
    .includes('job: validationCommands must be non-empty'));
});
test('runner command is validated through caller-owned script validator', () => {
  const f = fixture();
  f.job.runnerCommand = 'unsafe command';
  f.policy.validateJobCommands(f.job, 'job');
  assert.ok(f.violations.includes('job: runnerCommand: command must use npm run'));
});
test('backend-safe commands cannot become live runner commands', () => {
  assert.deepEqual(messagesAfter(job => { job.runnerCommand = 'npm run run:backend-safe'; }, 'validateJobCommands'),
    ['job: live runnerCommand must not be included in backend-safe verify']);
});
test('live_command requires live_network mode and a runner command', () => {
  const actual = messagesAfter(job => { job.mode = 'local_contract'; job.runnerCommand = ''; }, 'validateJobCommands');
  assert.ok(actual.includes('job: live_command requires runnerCommand'));
  assert.ok(actual.includes('job: live_command must use mode live_network'));
});
test('manual or local runner policies reject non-null runner commands', () => {
  for (const runPolicy of ['manual_artifact_then_validator', 'local_contract']) {
    const actual = messagesAfter(job => { job.runPolicy = runPolicy; }, 'validateJobCommands');
    assert.ok(actual.includes('job: ' + runPolicy + ' must keep runnerCommand=null'));
  }
});
test('required and optional env arrays cannot contain duplicate names', () => {
  const actual = messagesAfter(job => { job.requiredEnv = ['API_KEY', 'API_KEY']; }, 'validateJobEnvironment');
  assert.ok(actual.includes('job: requiredEnv contains duplicate env name "API_KEY"'));
});
test('environment variables preserve strict uppercase syntax', () => {
  const actual = messagesAfter(job => { job.optionalEnv = ['bad-name']; }, 'validateJobEnvironment');
  assert.ok(actual.includes('job: optionalEnv contains invalid env name "bad-name"'));
});
test('alternatives require labelled nonempty env names', () => {
  const actual = messagesAfter(job => {
    job.requiredEnvAlternatives = [{ label: '', env: ['bad-name'] }];
  }, 'validateJobEnvironment');
  assert.ok(actual.includes('job: requiredEnvAlternatives[0]: label must be a non-empty string'));
  assert.ok(actual.includes('job: requiredEnvAlternatives[0]: env contains invalid env name "bad-name"'));
});
test('alternative coverage cannot invent required env keys', () => {
  const actual = messagesAfter(job => {
    job.requiredEnvAlternatives = [{ label: 'artifact', env: ['API_KEY'], coversEnv: ['MISSING'] }];
  }, 'validateJobEnvironment');
  assert.ok(actual.includes('job: requiredEnvAlternatives[0]: coversEnv "MISSING" must be listed in requiredEnv'));
});
test('only original credential and artifact alternative modes are permitted', () => {
  const actual = messagesAfter(job => {
    job.requiredEnvAlternatives = [{ label: 'source', env: ['API_KEY'], mode: 'untrusted' }];
  }, 'validateJobEnvironment');
  assert.ok(actual.includes('job: requiredEnvAlternatives[0]: mode must be live_command_credential or captured_artifact when set'));
});
test('non-local jobs must keep required environment variables', () => {
  const actual = messagesAfter(job => { job.requiredEnv = []; }, 'validateJobEnvironment');
  assert.ok(actual.includes('job: non-local job must define requiredEnv'));
});
test('forbidden frontend and agent-runtime target references remain blocked', () => {
  for (const fragment of ['frontend', 'agent-runtime']) {
    const actual = messagesAfter(job => { job.validationCommands = ['npm run ' + fragment]; }, 'validateJobScopeSafety');
    assert.ok(actual.includes('job: must not reference forbidden target fragment "' + fragment + '"'));
  }
});
test('environment examples reject unexpected, duplicate, and populated entries', () => {
  const f = fixture({ envExampleSource:
    'EXTERNAL_BETA_EVIDENCE_CONFIRM=\nAPI_KEY=\nAPI_KEY=value\nUNEXPECTED=\n' });
  f.policy.validateEnvExample();
  assert.ok(f.violations.includes('fixtures/external-beta.example: duplicate env example entry "API_KEY"'));
  assert.ok(f.violations.includes('fixtures/external-beta.example: unexpected env example entry "UNEXPECTED"'));
  assert.ok(f.violations.includes('fixtures/external-beta.example: env example entry "API_KEY" must not commit a value'));
});
test('environment examples retain required key set and KEY= syntax', () => {
  const f = fixture({ envExampleSource: 'EXTERNAL_BETA_EVIDENCE_CONFIRM=\ninvalid\n' });
  f.policy.validateEnvExample();
  assert.ok(f.violations.includes('fixtures/external-beta.example:2: env example line must be KEY='));
  assert.ok(f.violations.includes('fixtures/external-beta.example: missing env example entry "API_KEY"'));
});
test('blank environment example is not accepted', () => {
  const f = fixture({ envExampleSource: '  ' });
  f.policy.validateEnvExample();
  assert.deepEqual(f.violations, ['fixtures/contract.json: envExample must reference a non-empty env example file']);
});
