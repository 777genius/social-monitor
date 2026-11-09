import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateWiring } from './external-beta-evidence-wiring-policy.mjs';

const json = path => JSON.parse(readFileSync(new URL('../../' + path, import.meta.url), 'utf8'));
const originalContract = json('ops/release/external-beta-evidence-runner.json');
const originalReadiness = json('ops/release/external-beta-readiness-contract.json');
const originalBackend = json('ops/release/backend-safe-verify-contract.json');
const originalBaseline = json('ops/release/release-baseline-contract.json');
const originalPackage = json('package.json');

function scriptNameFromCommand(command) {
  const match = /^npm run (?:--silent )?([^ ]+)/.exec(String(command ?? ''));
  return match?.[1] ?? null;
}

function fixture() {
  return {
    contract: JSON.parse(JSON.stringify(originalContract)),
    contractPath: 'ops/release/external-beta-evidence-runner.json',
    externalReadiness: JSON.parse(JSON.stringify(originalReadiness)),
    externalReadinessPath: 'ops/release/external-beta-readiness-contract.json',
    packageScripts: { ...originalPackage.scripts },
    packagePath: 'package.json',
    backendScripts: new Set(originalBackend.backendScripts),
    backendSafePath: 'ops/release/backend-safe-verify-contract.json',
    baselineScripts: new Set(originalBaseline.requiredGreenScripts),
    baselineArtifacts: new Set(originalBaseline.trackedArtifacts.map(artifact => artifact.path)),
    baselinePath: 'ops/release/release-baseline-contract.json',
    violations: [],
    scriptNameFromCommand,
  };
}

function rejects(change, diagnostic) {
  const context = fixture();
  change(context);
  validateWiring(context);
  assert.ok(context.violations.some(issue => issue.includes(diagnostic)),
    diagnostic + ' expected, actual: ' + context.violations.join('\n'));
}

test('tracked package, baseline, backend-safe and readiness wiring is valid', () => {
  const context = fixture();
  validateWiring(context);
  assert.deepEqual(context.violations, []);
});

test('missing required npm script is rejected', () => {
  rejects(context => {
    delete context.packageScripts[scriptNameFromCommand(context.contract.checkCommand)];
  }, 'missing npm script');
});

for (const [field, flag] of [
  ['jsonPlanCommand', '--json'],
  ['summaryCommand', '--summary'],
  ['handoffCommand', '--handoff'],
  ['handoffJsonCommand', '--handoff-json'],
  ['preflightCommand', '--require-env'],
  ['artifactValidationCommand', '--validate-artifacts'],
]) {
  test(field + ' must preserve ' + flag, () => {
    rejects(context => {
      context.packageScripts[scriptNameFromCommand(context.contract[field])] = 'node scripts/without-flags.mjs';
    }, 'must pass ' + flag);
  });
}

test('artifact validator must require environment as well as artifact validation', () => {
  rejects(context => {
    const script = scriptNameFromCommand(context.contract.artifactValidationCommand);
    context.packageScripts[script] = 'node scripts/validate.mjs --validate-artifacts';
  }, 'must pass --require-env');
});

test('current packaging command cannot be replaced by arbitrary script', () => {
  rejects(context => {
    context.packageScripts[scriptNameFromCommand(context.contract.currentPackageCommand)] = 'node scripts/other.mjs';
  }, 'must run scripts/package-current-external-beta-evidence.mjs');
});

test('backend-safe verification must include the contract checker', () => {
  rejects(context => {
    context.backendScripts.delete(scriptNameFromCommand(context.contract.checkCommand));
  }, 'backendScripts must include');
});

test('backend-safe verification cannot run live actions', () => {
  rejects(context => {
    context.backendScripts.add(scriptNameFromCommand(context.contract.executeCommand));
  }, 'backend-safe verify must not run');
});

test('baseline must include required checker command', () => {
  rejects(context => {
    context.baselineScripts.delete(scriptNameFromCommand(context.contract.checkCommand));
  }, 'requiredGreenScripts must include');
});

test('baseline must track the runner contract artifact', () => {
  rejects(context => { context.baselineArtifacts.delete(context.contractPath); },
    'trackedArtifacts must include');
});

test('missing evidenceRunner fails closed', () => {
  rejects(context => { context.externalReadiness.evidenceRunner = null; },
    'evidenceRunner is required');
});

for (const field of [
  'contract', 'checkCommand', 'planCommand', 'jsonPlanCommand',
  'summaryCommand', 'handoffCommand', 'handoffJsonCommand',
  'preflightCommand', 'artifactValidationCommand', 'dockerBundleImportCommand',
  'currentPackageCommand',
]) {
  test('readiness evidenceRunner.' + field + ' must match runner contract', () => {
    rejects(context => {
      context.externalReadiness.evidenceRunner[field] = 'intentionally-wrong-value';
    }, 'evidenceRunner.' + field + ' must ');
  });
}
