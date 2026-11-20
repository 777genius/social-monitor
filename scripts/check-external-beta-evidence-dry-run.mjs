import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createExternalBetaDryRunPlanPolicy } from './lib/external-beta-dry-run-plan-policy.mjs';
import { createExternalBetaDryRunHandoffPolicy } from './lib/external-beta-dry-run-handoff-policy.mjs';

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

function validateRunnerSafety() {
  const safety = runner.executionSafety ?? {};
  for (const forbiddenTarget of dryRun.forbiddenTargets ?? []) {
    if (!safety.forbiddenTargets?.includes(forbiddenTarget)) {
      violations.push(`${runnerPath}: executionSafety.forbiddenTargets must include ${forbiddenTarget}`);
    }
  }

  const dryRunCommandText = [
    dryRun.checkCommand,
    dryRun.planJsonCommand,
    dryRun.handoffCommand,
    dryRun.handoffJsonCommand,
    dryRun.summaryCommand,
    dryRun.preflightCommand,
    dryRun.artifactValidationCommand,
    dryRun.currentPackageCommand,
    dryRun.liveExecutionTemplate,
  ].join('\n').toLowerCase();
  for (const forbiddenTarget of dryRun.forbiddenTargets ?? []) {
    if (dryRunCommandText.includes(forbiddenTarget)) {
      violations.push(`${dryRunPath}: dry-run commands must not target ${forbiddenTarget}`);
    }
  }

  for (const job of runner.jobs ?? []) {
    if (job.blocksExternalBeta !== true) {
      violations.push(`${runnerPath}: ${job.jobId} must block external beta`);
    }
    for (const command of [job.runnerCommand, ...(job.validationCommands ?? [])]) {
      if (typeof command !== 'string') {
        continue;
      }
      for (const forbiddenTarget of dryRun.forbiddenTargets ?? []) {
        if (command.toLowerCase().includes(forbiddenTarget)) {
          violations.push(`${runnerPath}: ${job.jobId} command must not target ${forbiddenTarget}: ${command}`);
        }
      }
    }
  }
}

function validateReadinessLinkage() {
  if (readiness.externalBetaDecision !== 'hold') {
    violations.push(`${readinessPath}: externalBetaDecision must stay hold until live evidence is attached`);
  }
  if (readiness.evidenceMode !== 'fixture_contract_with_external_evidence_required') {
    violations.push(`${readinessPath}: evidenceMode must require external evidence`);
  }
  const readinessRunner = readiness.evidenceRunner ?? {};
  if (readinessRunner.contract !== runnerPath) {
    violations.push(`${readinessPath}: evidenceRunner.contract must point at ${runnerPath}`);
  }
  if (readinessRunner.jsonPlanCommand !== dryRun.planJsonCommand) {
    violations.push(`${readinessPath}: evidenceRunner.jsonPlanCommand must match dry-run plan command`);
  }
  if (readinessRunner.handoffJsonCommand !== dryRun.handoffJsonCommand) {
    violations.push(`${readinessPath}: evidenceRunner.handoffJsonCommand must match dry-run JSON handoff command`);
  }
  if (readinessRunner.currentPackageCommand !== dryRun.currentPackageCommand) {
    violations.push(`${readinessPath}: evidenceRunner.currentPackageCommand must match dry-run current package command`);
  }
}

function validateArtifactCoverage() {
  const runnerEnvFormats = [
    ...new Set(
      (runner.jobs ?? [])
        .flatMap((job) => job.outputArtifacts ?? [])
        .filter((artifact) => artifact.env !== undefined)
        .map((artifact) => artifact.format),
    ),
  ];
  assertSameSet(runnerEnvFormats, dryRun.requiredArtifactFormats ?? [], `${dryRunPath}: requiredArtifactFormats`);

  const exampleFormats = new Set((runner.artifactExamples ?? []).map((example) => example.format));
  for (const format of dryRun.requiredArtifactFormats ?? []) {
    if (!exampleFormats.has(format)) {
      violations.push(`${runnerPath}: artifactExamples must include dry-run required format ${format}`);
    }
  }

  for (const job of runner.jobs ?? []) {
    const envArtifacts = (job.outputArtifacts ?? []).filter((artifact) => artifact.env !== undefined);
    if (job.runPolicy !== 'local_contract' && envArtifacts.length === 0) {
      violations.push(`${runnerPath}: ${job.jobId} external job must produce at least one env evidence artifact`);
    }
    for (const artifact of envArtifacts) {
      if (!dryRun.requiredMissingEnvWithoutCredentials?.includes(artifact.env)) {
        violations.push(`${dryRunPath}: ${artifact.env} must stay required in clean-env dry-run output`);
      }
    }
  }
}

function validateEnvExample() {
  const source = readFileSync(dryRun.envExample, 'utf8');
  const requiredEnv = new Set([
    ...(dryRun.requiredMissingEnvWithoutCredentials ?? []),
    ...(plan.uniqueMissingOptionalEnv ?? []),
  ]);

  for (const envName of requiredEnv) {
    const assignment = new RegExp(`^${escapeRegex(envName)}=`, 'm');
    if (!assignment.test(source)) {
      violations.push(`${dryRun.envExample}: must include ${envName}=`);
    }
    const nonEmptyAssignment = new RegExp(`^${escapeRegex(envName)}=\\S`, 'm');
    if (nonEmptyAssignment.test(source)) {
      violations.push(`${dryRun.envExample}: ${envName} must not have a committed value`);
    }
  }
}

function validateWiring() {
  if (packageScripts['check:external-beta-evidence-dry-run'] !== 'node scripts/check-external-beta-evidence-dry-run.mjs') {
    violations.push(`${packagePath}: check:external-beta-evidence-dry-run must run the dry-run checker`);
  }
  if (!backendScripts.has('check:external-beta-evidence-dry-run')) {
    violations.push(`${backendSafePath}: backendScripts must include check:external-beta-evidence-dry-run`);
  }
  if (!baselineScripts.has('check:external-beta-evidence-dry-run')) {
    violations.push(`${baselinePath}: requiredGreenScripts must include check:external-beta-evidence-dry-run`);
  }
  if (!baselineArtifacts.has(dryRunPath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include ${dryRunPath}`);
  }
}

function assertSameSet(actual, expected, label) {
  const actualSorted = [...new Set(actual)].sort();
  const expectedSorted = [...new Set(expected)].sort();
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    violations.push(`${label}: expected [${expectedSorted.join(', ')}], got [${actualSorted.join(', ')}]`);
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
