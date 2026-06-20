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

const plan = readRunnerJsonWithCleanEnv(['--plan', '--json']);
const handoff = readRunnerJsonWithCleanEnv(['--handoff-json']);

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
    ['handoffJsonCommand', 'handoffJsonCommand'],
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

function validateHandoffShape() {
  if (handoff.runnerId !== runner.runnerId) {
    violations.push(`${dryRunPath}: JSON handoff runnerId must match ${runnerPath}`);
  }
  if (handoff.scope !== dryRun.scope) {
    violations.push(`${dryRunPath}: JSON handoff scope must match dry-run scope`);
  }
  if (handoff.frontendPolicy !== dryRun.frontendPolicy) {
    violations.push(`${dryRunPath}: JSON handoff frontendPolicy must match dry-run frontendPolicy`);
  }
  if (handoff.envTemplate !== dryRun.envExample) {
    violations.push(`${dryRunPath}: JSON handoff envTemplate must match dry-run envExample`);
  }
  if (handoff.inputMatrix?.matrixId !== 'external-beta-evidence-input-matrix-v1') {
    violations.push(`${dryRunPath}: JSON handoff must expose external beta evidence input matrix id`);
  }
  if (handoff.inputMatrix?.secretValuePolicy !== 'never_commit_values') {
    violations.push(`${dryRunPath}: JSON handoff input matrix must preserve secret value policy`);
  }
  if (handoff.inputMatrix?.artifactPathPolicy !== 'absolute_json_private_0600_non_workspace_non_fixture_path') {
    violations.push(`${dryRunPath}: JSON handoff input matrix must preserve artifact path policy`);
  }
  if (handoff.safety?.handoffJsonCommand !== dryRun.handoffJsonCommand) {
    violations.push(`${dryRunPath}: JSON handoff must expose the dry-run JSON handoff command`);
  }
  if (handoff.safety?.envValuePolicy !== 'names_only') {
    violations.push(`${dryRunPath}: JSON handoff safety.envValuePolicy must be names_only`);
  }
  if (handoff.safety?.evidencePathPolicy !== 'absolute_json_private_0600_non_workspace_non_fixture_path') {
    violations.push(`${dryRunPath}: JSON handoff must preserve evidence path safety policy`);
  }

  const readiness = handoff.readiness ?? {};
  const expectedReadiness = {
    localContractJobs: plan.localContractJobCount,
    totalJobs: plan.jobCount,
    contractClosurePercent: plan.contractClosurePercent,
    externalEvidenceReadyJobs: plan.executableLiveJobCount + plan.manualArtifactReadyForValidationJobCount,
    externalEvidenceTotalJobs: plan.liveCommandJobCount + plan.manualArtifactJobCount,
    externalEvidenceEnvReadinessPercent: plan.externalEvidenceEnvReadinessPercent,
    externalBlockerJobCount: plan.externalBlockerJobCount,
    blockedMissingRequiredEnvJobCount: plan.blockedMissingRequiredEnvJobCount,
    blockedInvalidInputJobCount: plan.blockedInvalidInputJobCount,
    blockedLocalRuntimeEnvJobCount: plan.blockedLocalRuntimeEnvJobCount,
  };
  for (const [field, expectedValue] of Object.entries(expectedReadiness)) {
    if (readiness[field] !== expectedValue) {
      violations.push(`${dryRunPath}: JSON handoff readiness.${field} must be ${expectedValue}, got ${readiness[field]}`);
    }
  }
  assertSameSet(readiness.uniqueMissingEnv ?? [], plan.uniqueMissingEnv ?? [], `${dryRunPath}: JSON handoff uniqueMissingEnv`);
  assertSameSet(
    readiness.uniqueMissingOptionalEnv ?? [],
    plan.uniqueMissingOptionalEnv ?? [],
    `${dryRunPath}: JSON handoff uniqueMissingOptionalEnv`,
  );

  assertSameSet(handoff.jobs?.map((job) => job.jobId) ?? [], dryRun.requiredJobIds ?? [], `${dryRunPath}: JSON handoff jobs`);
  const handoffJobsById = new Map((handoff.jobs ?? []).map((job) => [job.jobId, job]));
  const planJobsById = new Map((plan.jobs ?? []).map((job) => [job.jobId, job]));
  for (const jobId of dryRun.requiredJobIds ?? []) {
    const handoffJob = handoffJobsById.get(jobId);
    const planJob = planJobsById.get(jobId);
    if (handoffJob === undefined || planJob === undefined) {
      continue;
    }
    if (handoffJob.executionReadiness !== planJob.executionReadiness) {
      violations.push(`${dryRunPath}: JSON handoff ${jobId} readiness must match plan`);
    }
    if (handoffJob.operatorAction?.length <= 0) {
      violations.push(`${dryRunPath}: JSON handoff ${jobId} must include operatorAction`);
    }
    if (!Array.isArray(handoffJob.outputArtifacts) || handoffJob.outputArtifacts.length === 0) {
      violations.push(`${dryRunPath}: JSON handoff ${jobId} must include outputArtifacts`);
    }
    assertSameSet(
      handoffJob.requiredInputs?.map((input) => input.env) ?? [],
      handoffJob.requiredEnv ?? [],
      `${dryRunPath}: JSON handoff ${jobId} requiredInputs`,
    );
    assertSameSet(
      handoffJob.optionalInputs?.map((input) => input.env) ?? [],
      handoffJob.optionalEnv ?? [],
      `${dryRunPath}: JSON handoff ${jobId} optionalInputs`,
    );
    for (const input of [...(handoffJob.requiredInputs ?? []), ...(handoffJob.optionalInputs ?? [])]) {
      if (typeof input.inputClass !== 'string' || input.inputClass === 'unclassified') {
        violations.push(`${dryRunPath}: JSON handoff ${jobId} input ${input.env} must include matrix inputClass`);
      }
      if (typeof input.description !== 'string' || input.description.trim().length === 0) {
        violations.push(`${dryRunPath}: JSON handoff ${jobId} input ${input.env} must include matrix description`);
      }
    }
    for (const artifact of handoffJob.outputArtifacts ?? []) {
      if (artifact.env !== null && !String(artifact.location).startsWith('<env:')) {
        violations.push(`${dryRunPath}: JSON handoff ${jobId} env artifact must use env-only location`);
      }
      if (artifact.env !== null && artifact.examplePath === null) {
        violations.push(`${dryRunPath}: JSON handoff ${jobId} env artifact ${artifact.env} must include fixture example path`);
      }
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
    dryRun.handoffJsonCommand,
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
  if (readinessRunner.handoffJsonCommand !== dryRun.handoffJsonCommand) {
    violations.push(`${readinessPath}: evidenceRunner.handoffJsonCommand must match dry-run JSON handoff command`);
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
