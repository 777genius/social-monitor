import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createExternalBetaDryRunPlanPolicy } from './lib/external-beta-dry-run-plan-policy.mjs';
import { createExternalBetaDryRunHandoffPolicy } from './lib/external-beta-dry-run-handoff-policy.mjs';
import { createExternalBetaDryRunSafetyLinkagePolicy } from './lib/external-beta-dry-run-safety-linkage-policy.mjs';
import { createExternalBetaDryRunPackageAdmission } from './lib/external-beta-dry-run-package-admission.mjs';

const dryRunPath = 'ops/release/external-beta-evidence-dry-run.json';
const runnerPath = 'ops/release/external-beta-evidence-runner.json';
const readinessPath = 'ops/release/external-beta-readiness-contract.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';
const packagePath = 'package.json';

const dryRun = readJson(dryRunPath);
const runner = readJson(runnerPath);
const readiness = readJson(readinessPath);
const backendSafe = readJson(backendSafePath);
const baseline = readJson(baselinePath);
const packageJson = readJson(packagePath);
const packageScripts = packageJson.scripts ?? {};
const backendScripts = new Set(backendSafe.backendScripts ?? []);
const baselineScripts = new Set(baseline.requiredGreenScripts ?? []);
const baselineArtifacts = new Set((baseline.trackedArtifacts ?? []).map((artifact) => artifact.path));
const violations = [];

const plan = readRunnerJsonWithCleanEnv(['--plan', '--json']);
const handoff = readRunnerJsonWithCleanEnv(['--handoff-json']);
const { validateDryRunContract, validatePlanShape } = createExternalBetaDryRunPlanPolicy({
  dryRun, runner, plan, dryRunPath, runnerPath, existsSync, assertSameSet, violations,
});

const { validateHandoffShape } = createExternalBetaDryRunHandoffPolicy({
  handoff, runner, dryRun, dryRunPath, runnerPath, plan, violations, assertSameSet,
});

const { validateRunnerSafety, validateReadinessLinkage } = createExternalBetaDryRunSafetyLinkagePolicy({
  runner, dryRun, readiness, runnerPath, dryRunPath, readinessPath, violations,
});

const { validateArtifactCoverage, validateEnvExample, validateWiring } = createExternalBetaDryRunPackageAdmission({
  runner, dryRun, plan, runnerPath, dryRunPath, packageScripts, backendScripts,
  baselineScripts, baselineArtifacts, packagePath, backendSafePath, baselinePath,
  violations, readFileSync, assertSameSet,
});

validateDryRunContract();
validatePlanShape();
validateHandoffShape();
validateRunnerSafety();
validateReadinessLinkage();
validateArtifactCoverage();
validateEnvExample();
validateWiring();

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('External beta evidence dry-run package OK');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readRunnerJsonWithCleanEnv(args) {
  const output = execFileSync(
    process.execPath,
    ['scripts/external-beta-evidence-runner.mjs', ...args],
    {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH ?? '',
      },
    },
  );
  return JSON.parse(output);
}


function assertSameSet(actual, expected, label) {
  const actualSorted = [...new Set(actual)].sort();
  const expectedSorted = [...new Set(expected)].sort();
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    violations.push(`${label}: expected [${expectedSorted.join(', ')}], got [${actualSorted.join(', ')}]`);
  }
}

