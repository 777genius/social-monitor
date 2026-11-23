import test from 'node:test';
import assert from 'node:assert/strict';
import { createExternalBetaPlanPrinter } from './external-beta-evidence-plan-printer.mjs';

function capture(fn) {
  const previous = console.log;
  const lines = [];
  console.log = (...args) => lines.push(args.join(' '));
  try { fn(); } finally { console.log = previous; }
  return lines.join('\n');
}

function plan(overrides = {}) {
  return {
    mode: 'plan_only', jobCount: 0, localContractJobCount: 0,
    liveCommandJobCount: 0, manualArtifactJobCount: 0,
    executableLiveJobCount: 0, liveArtifactReadyForValidationJobCount: 0,
    externalBlockerJobCount: 0, jobs: [], missingEnvCount: 0,
    missingOptionalEnvCount: 0, ...overrides,
  };
}

test('preserves exact empty-plan CLI output and ordering', () => {
  const { printPlan } = createExternalBetaPlanPrinter({
    contract: { runnerId: 'runner' },
    formatRequiredEnvAlternatives: () => 'none',
    formatOutputArtifacts: () => 'none',
  });
  assert.equal(capture(() => printPlan(plan())), [
    'External beta evidence plan (runner)',
    'Mode: plan_only', 'Jobs: 0',
    'Run policies: local=0, live=0, manual=0',
    'Executable live jobs: 0', 'Live artifact ready jobs: 0',
    'External beta blocker jobs: 0',
  ].join('\n'));
});

test('keeps live formatter calls, field order, and safe env-name-only presentation', () => {
  const job = {
    jobId: 'job-a', evidenceGroupId: 'group-a', mode: 'live',
    runPolicy: 'live_command', executionReadiness: 'ready', owner: 'operator',
    runnerCommand: 'npm run smoke', validationCommands: ['npm run check'],
    requiredEnv: ['TOKEN'], optionalEnv: [], missingEnv: [],
    missingOptionalEnv: [], preflightViolations: [], exitCondition: 'verified',
  };
  const calls = [];
  const { printPlan } = createExternalBetaPlanPrinter({
    contract: { runnerId: 'runner' },
    formatRequiredEnvAlternatives: (arg) => { calls.push(['alternatives', arg]); return 'none'; },
    formatOutputArtifacts: (arg) => { calls.push(['artifacts', arg]); return 'artifact.json'; },
  });
  const lines = capture(() => printPlan(plan({ jobCount: 1, liveCommandJobCount: 1, jobs: [job] }))).split('\n');
  assert.deepEqual(calls, [['alternatives', job], ['artifacts', job]]);
  assert.ok(lines.indexOf('  requiredEnv: TOKEN') < lines.indexOf('  outputArtifacts: artifact.json'));
  assert.ok(lines.includes('  validators: npm run check'));
  assert.ok(lines.includes('  exit: verified'));
  assert.ok(!lines.some(x => x.includes('TOKEN=secret')));
});

test('retains positive-only optional and required missing-env counters', () => {
  const { printPlan } = createExternalBetaPlanPrinter({
    contract: { runnerId: 'runner' },
    formatRequiredEnvAlternatives: () => 'none',
    formatOutputArtifacts: () => 'none',
  });
  assert.match(capture(() => printPlan(plan({ missingEnvCount: 2, missingOptionalEnvCount: 3 }))),
    /Missing required env count: 2\nMissing optional env count: 3$/);
  assert.doesNotMatch(capture(() => printPlan(plan())), /Missing required env count:/);
});
