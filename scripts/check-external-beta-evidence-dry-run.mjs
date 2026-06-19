import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

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

const plan = readPlanWithCleanEnv();

validateDryRunContract();
validatePlanShape();
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

function readPlanWithCleanEnv() {
  const output = execFileSync(
    process.execPath,
    ['scripts/external-beta-evidence-runner.mjs', '--plan', '--json'],
    {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH ?? '',
      },
    },
  );
  return JSON.parse(output);
}

function validateDryRunContract() {
  if (dryRun.schemaVersion !== 1) {
    violations.push(`${dryRunPath}: schemaVersion must be 1`);
  }
  if (dryRun.scope !== 'backend-only') {
    violations.push(`${dryRunPath}: scope must be backend-only`);
  }
  if (dryRun.frontendPolicy !== 'deferred_contract_only') {
    violations.push(`${dryRunPath}: frontendPolicy must keep frontend deferred`);
  }
  if (dryRun.defaultMode !== 'plan_only') {
    violations.push(`${dryRunPath}: defaultMode must be plan_only`);
  }
  if (dryRun.notEvidence !== true) {
    violations.push(`${dryRunPath}: notEvidence must be true`);
  }
  if (dryRun.doesNotUnblockExternalBeta !== true) {
    violations.push(`${dryRunPath}: doesNotUnblockExternalBeta must be true`);
  }

  for (const path of [dryRun.sourceRunnerContract, dryRun.sourceReadinessContract, dryRun.envExample]) {
    if (!existsSync(path ?? '')) {
      violations.push(`${dryRunPath}: referenced file must exist: ${path}`);
    }
  }

  const commandPairs = [
    ['planJsonCommand', 'jsonPlanCommand'],
    ['handoffCommand', 'handoffCommand'],
    ['summaryCommand', 'summaryCommand'],
    ['preflightCommand', 'preflightCommand'],
    ['artifactValidationCommand', 'artifactValidationCommand'],
  ];
  for (const [dryRunField, runnerField] of commandPairs) {
    if (dryRun[dryRunField] !== runner[runnerField]) {
      violations.push(`${dryRunPath}: ${dryRunField} must match runner ${runnerField}`);
    }
  }

  if (!String(dryRun.liveExecutionTemplate).includes('EXTERNAL_BETA_EVIDENCE_CONFIRM=run-live')) {
    violations.push(`${dryRunPath}: liveExecutionTemplate must include explicit live confirmation`);
  }
  if (!String(dryRun.liveExecutionTemplate).includes('--execute')) {
    violations.push(`${dryRunPath}: liveExecutionTemplate must include --execute`);
  }
  if (String(dryRun.planJsonCommand).includes('--execute')) {
    violations.push(`${dryRunPath}: planJsonCommand must not execute live jobs`);
  }
}

function validatePlanShape() {
  if (plan.runnerId !== runner.runnerId) {
    violations.push(`${dryRunPath}: plan runnerId must match ${runnerPath}`);
  }
  if (plan.mode !== 'plan_only') {
    violations.push(`${dryRunPath}: clean-env plan must stay plan_only`);
  }

  const expectedCounts = dryRun.expectedPlanCountsWithoutCredentials ?? {};
  for (const [field, expectedValue] of Object.entries(expectedCounts)) {
    if (plan[field] !== expectedValue) {
      violations.push(`${dryRunPath}: clean-env plan ${field} must be ${expectedValue}, got ${plan[field]}`);
    }
  }

  assertSameSet(plan.jobs?.map((job) => job.jobId) ?? [], dryRun.requiredJobIds ?? [], `${dryRunPath}: requiredJobIds`);
  assertSameSet(plan.uniqueMissingEnv ?? [], dryRun.requiredMissingEnvWithoutCredentials ?? [], `${dryRunPath}: requiredMissingEnvWithoutCredentials`);
  assertSameSet(
    Object.keys(plan.readinessCounts ?? {}),
    dryRun.requiredReadinessStatesWithoutCredentials ?? [],
    `${dryRunPath}: requiredReadinessStatesWithoutCredentials`,
  );

  for (const job of plan.jobs ?? []) {
    if (job.blocksExternalBeta !== true) {
      violations.push(`${dryRunPath}: ${job.jobId} must remain an external beta blocker`);
    }
    if (typeof job.owner !== 'string' || job.owner.trim().length === 0) {
      violations.push(`${dryRunPath}: ${job.jobId} must define owner`);
    }
    if (typeof job.exitCondition !== 'string' || job.exitCondition.trim().length === 0) {
      violations.push(`${dryRunPath}: ${job.jobId} must define exitCondition`);
    }
    if (!Array.isArray(job.validationCommands) || job.validationCommands.length === 0) {
      violations.push(`${dryRunPath}: ${job.jobId} must define validationCommands`);
    }
    if (job.runPolicy === 'local_contract' && job.executionReadiness !== 'local_contract_ready') {
      violations.push(`${dryRunPath}: ${job.jobId} local contract must stay local_contract_ready in clean env`);
    }
    if (job.runPolicy !== 'local_contract' && job.executionReadiness !== 'blocked_missing_required_env') {
      violations.push(`${dryRunPath}: ${job.jobId} external evidence job must stay blocked without credentials`);
    }
    if (job.runPolicy === 'live_command' && typeof job.runnerCommand !== 'string') {
      violations.push(`${dryRunPath}: ${job.jobId} live command job must expose runnerCommand`);
    }
    if (job.runPolicy === 'manual_artifact_then_validator' && job.runnerCommand !== null) {
      violations.push(`${dryRunPath}: ${job.jobId} manual artifact job must not expose runnerCommand`);
    }
  }
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
    dryRun.summaryCommand,
    dryRun.preflightCommand,
    dryRun.artifactValidationCommand,
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
