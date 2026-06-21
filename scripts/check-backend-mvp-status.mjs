import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const contractPath = 'ops/release/backend-mvp-status-contract.json';
const auditPath = 'ops/release/backend-mvp-completion-audit.json';
const externalReadinessPath = 'ops/release/external-beta-readiness-contract.json';
const evidenceRunnerPath = 'ops/release/external-beta-evidence-runner.json';
const evidenceDryRunPath = 'ops/release/external-beta-evidence-dry-run.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const backendOpsPath = 'ops/release/backend-ops-readiness-contract.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';
const packagePath = 'package.json';

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const envFileSelection = readStatusEnvFileSelection(args);
const statusEnvFilePaths = envFileSelection.paths;
const statusUsesEnvFile = statusEnvFilePaths.length > 0;

const contract = readJson(contractPath);
const audit = readJson(auditPath);
const externalReadiness = readJson(externalReadinessPath);
const evidenceRunner = readJson(evidenceRunnerPath);
const evidenceDryRun = readJson(evidenceDryRunPath);
const releaseContract = readJson(releaseContractPath);
const backendOps = readJson(backendOpsPath);
const backendSafe = readJson(backendSafePath);
const baseline = readJson(baselinePath);
const packageJson = readJson(packagePath);
const scripts = packageJson.scripts ?? {};
const violations = envFileSelection.errors.map((error) => `${contractPath}: ${error}`);

const cleanEvidencePlan = readEvidencePlan({ cleanEnv: true });
const evidencePlan = jsonOutput || statusUsesEnvFile
  ? readEvidencePlan({ cleanEnv: false, envFilePaths: statusEnvFilePaths })
  : cleanEvidencePlan;
const cleanStatus = buildStatus(cleanEvidencePlan, { cleanEnv: true });
const status = jsonOutput || statusUsesEnvFile
  ? buildStatus(evidencePlan, { envFileCount: statusEnvFilePaths.length })
  : cleanStatus;

validateContract();
validateStatus();
validateActiveExternalBlockerSemantics();
validateLocalRuntimeStatusSmoke();
validateEnvFileStatusSmoke();
validateWiring();

if (violations.length > 0) {
  if (jsonOutput) {
    console.log(JSON.stringify({ ...status, valid: false, violations }, null, 2));
  } else {
    console.error(violations.join('\n'));
  }
  process.exit(1);
}

if (jsonOutput) {
  console.log(JSON.stringify({ ...status, valid: true }, null, 2));
} else {
  console.log('Backend MVP status contract OK');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readEvidencePlan({ cleanEnv, envOverride, envFilePaths = [] }) {
  const env = envOverride !== undefined
    ? {
        PATH: process.env.PATH ?? '',
        ...envOverride,
      }
    : cleanEnv
      ? {
          PATH: process.env.PATH ?? '',
        }
      : process.env;
  const runnerArgs = ['scripts/external-beta-evidence-runner.mjs', '--plan', '--json'];
  for (const path of envFilePaths) {
    runnerArgs.push('--env-file', path);
  }
  const output = execFileSync(
    process.execPath,
    runnerArgs,
    {
      encoding: 'utf8',
      env,
    },
  );
  return JSON.parse(output);
}

function buildStatus(plan, options = {}) {
  const requirements = audit.requirements ?? [];
  const blockingRequirements = requirements.filter((requirement) => requirement.blocksMvpExit === true);
  const passedBlockingRequirements = blockingRequirements.filter((requirement) => requirement.status === 'passed');
  const statusCounts = countBy(requirements, (requirement) => requirement.status);
  const blockerRequirements = blockingRequirements
    .filter((requirement) => requirement.status !== 'passed')
    .map((requirement) => ({
      requirementId: requirement.requirementId,
      planLabel: requirement.planLabel,
      status: requirement.status,
      owner: requirement.owner,
      exitCondition: requirement.exitCondition,
      goCondition: requirement.goCondition,
    }));
  const activeExternalEvidenceBlockerJobs = (plan.jobs ?? [])
    .filter((job) => job.blocksExternalBeta === true && isActiveEvidenceBlockerReadiness(job.executionReadiness))
    .map((job) => ({
      jobId: job.jobId,
      executionReadiness: job.executionReadiness,
      missingEnv: job.missingEnv ?? [],
      preflightViolations: job.preflightViolations ?? [],
    }));
  const externalEvidenceReadyJobCount =
    plan.executableLiveJobCount +
    (plan.liveArtifactReadyForValidationJobCount ?? 0) +
    plan.manualArtifactReadyForValidationJobCount;
  const externalEvidenceTotalJobCount = plan.liveCommandJobCount + plan.manualArtifactJobCount;

  const strictExternalBetaReady = (
    audit.completionStatus === 'complete' &&
    externalReadiness.externalBetaDecision === 'go' &&
    passedBlockingRequirements.length === blockingRequirements.length &&
    activeExternalEvidenceBlockerJobs.length === 0 &&
    plan.externalEvidenceEnvReadinessPercent === 100
  );

  return {
    schemaVersion: 1,
    statusModelId: contract.statusModelId,
    scope: contract.scope,
    frontendPolicy: contract.frontendPolicy,
    sourceAudit: contract.sourceAudit,
    sourceExternalReadiness: contract.sourceExternalReadiness,
    sourceEvidenceRunner: contract.sourceEvidenceRunner,
    evidenceInputMode: statusEvidenceInputMode(options),
    evidenceEnvFileCount: options.envFileCount ?? 0,
    decisions: {
      completionStatus: audit.completionStatus,
      externalBetaDecision: externalReadiness.externalBetaDecision,
    },
    strictExternalBetaReady,
    strictExternalBetaExitPercent: percent(passedBlockingRequirements.length, blockingRequirements.length),
    contractClosurePercent: plan.contractClosurePercent,
    externalEvidenceEnvReadinessPercent: plan.externalEvidenceEnvReadinessPercent,
    blockedMissingRequiredEnvJobCount: plan.blockedMissingRequiredEnvJobCount,
    blockedInvalidInputJobCount: plan.blockedInvalidInputJobCount,
    blockedLocalRuntimeEnvJobCount: plan.blockedLocalRuntimeEnvJobCount ?? 0,
    requirementCount: requirements.length,
    blockingRequirementCount: blockingRequirements.length,
    passedBlockingRequirementCount: passedBlockingRequirements.length,
    requirementStatusCounts: statusCounts,
    externalEvidenceJobCount: plan.jobCount,
    externalBlockerJobCount: activeExternalEvidenceBlockerJobs.length,
    evidenceReadinessCounts: plan.readinessCounts,
    externalEvidenceReadyJobCount,
    externalEvidenceTotalJobCount,
    totalExternalBetaBlockingJobCount: plan.externalBlockerJobCount,
    missingRequiredEnv: plan.uniqueMissingEnv,
    missingOptionalEnv: plan.uniqueMissingOptionalEnv,
    activeExternalEvidenceBlockerJobs,
    blockerRequirements,
  };
}

function isActiveEvidenceBlockerReadiness(readiness) {
  return [
    'blocked_missing_required_env',
    'blocked_invalid_env',
    'blocked_local_runtime_env',
  ].includes(readiness);
}

function statusEvidenceInputMode(options) {
  if (options.cleanEnv === true) {
    return 'clean_env';
  }
  if ((options.envFileCount ?? 0) > 0) {
    return 'env_file';
  }
  return 'shell_env';
}

function validateContract() {
  if (contract.schemaVersion !== 1) {
    violations.push(`${contractPath}: schemaVersion must be 1`);
  }
  if (contract.scope !== 'backend-only') {
    violations.push(`${contractPath}: scope must be backend-only`);
  }
  if (contract.frontendPolicy !== 'deferred_contract_only') {
    violations.push(`${contractPath}: frontendPolicy must keep frontend deferred`);
  }
  if (contract.sourceAudit !== auditPath) {
    violations.push(`${contractPath}: sourceAudit must be ${auditPath}`);
  }
  if (contract.sourceExternalReadiness !== externalReadinessPath) {
    violations.push(`${contractPath}: sourceExternalReadiness must be ${externalReadinessPath}`);
  }
  if (contract.sourceEvidenceRunner !== evidenceRunnerPath) {
    violations.push(`${contractPath}: sourceEvidenceRunner must be ${evidenceRunnerPath}`);
  }
  if (contract.sourceEvidenceDryRun !== evidenceDryRunPath) {
    violations.push(`${contractPath}: sourceEvidenceDryRun must be ${evidenceDryRunPath}`);
  }
  for (const path of [
    contract.sourceAudit,
    contract.sourceExternalReadiness,
    contract.sourceEvidenceRunner,
    contract.sourceEvidenceDryRun,
  ]) {
    if (!existsSync(path ?? '')) {
      violations.push(`${contractPath}: referenced source must exist: ${path}`);
    }
  }
  if (contract.forbidSubjectiveOverallPercent !== true) {
    violations.push(`${contractPath}: forbidSubjectiveOverallPercent must be true`);
  }
  if (contract.cleanEnvMustRemainBlocked !== true) {
    violations.push(`${contractPath}: cleanEnvMustRemainBlocked must be true`);
  }
  if (contract.secretValuePolicy !== 'env_names_only') {
    violations.push(`${contractPath}: secretValuePolicy must be env_names_only`);
  }
}

function validateStatus() {
  if (audit.scope !== contract.scope || externalReadiness.scope !== contract.scope || evidenceRunner.scope !== contract.scope) {
    violations.push(`${contractPath}: all status sources must stay backend-only`);
  }
  if (
    audit.frontendPolicy !== contract.frontendPolicy ||
    externalReadiness.frontendPolicy !== contract.frontendPolicy ||
    evidenceRunner.frontendPolicy !== contract.frontendPolicy
  ) {
    violations.push(`${contractPath}: all status sources must keep frontend deferred`);
  }
  if (audit.externalBetaDecision !== externalReadiness.externalBetaDecision) {
    violations.push(`${auditPath}: externalBetaDecision must match ${externalReadinessPath}`);
  }
  if (status.requirementCount < contract.minimumRequirementCount) {
    violations.push(`${contractPath}: requirementCount must be at least ${contract.minimumRequirementCount}`);
  }
  if (status.externalEvidenceJobCount < contract.minimumEvidenceJobCount) {
    violations.push(`${contractPath}: externalEvidenceJobCount must be at least ${contract.minimumEvidenceJobCount}`);
  }
  for (const field of contract.requiredStatusFields ?? []) {
    if (status[field] === undefined) {
      violations.push(`${contractPath}: status output must include ${field}`);
    }
  }
  if (status.overallPercent !== undefined || status.mvpReadyPercent !== undefined) {
    violations.push(`${contractPath}: status output must not include subjective overall percent fields`);
  }
  if (!['clean_env', 'shell_env', 'env_file'].includes(status.evidenceInputMode)) {
    violations.push(`${contractPath}: evidenceInputMode must be clean_env, shell_env or env_file`);
  }
  if (!Number.isInteger(status.evidenceEnvFileCount) || status.evidenceEnvFileCount < 0) {
    violations.push(`${contractPath}: evidenceEnvFileCount must be a non-negative integer`);
  }
  if (externalReadiness.externalBetaDecision === 'hold') {
    if (status.strictExternalBetaReady !== false) {
      violations.push(`${contractPath}: hold decision must produce strictExternalBetaReady=false`);
    }
    if (contract.holdDecisionRequiresBlockers === true && status.blockerRequirements.length === 0) {
      violations.push(`${contractPath}: hold decision must expose blockerRequirements`);
    }
  }
  if (status.strictExternalBetaReady === true) {
    if (status.strictExternalBetaExitPercent !== 100) {
      violations.push(`${contractPath}: strictExternalBetaReady requires strictExternalBetaExitPercent=100`);
    }
    if (status.externalEvidenceEnvReadinessPercent !== 100) {
      violations.push(`${contractPath}: strictExternalBetaReady requires externalEvidenceEnvReadinessPercent=100`);
    }
    if (status.externalBlockerJobCount !== 0 || status.missingRequiredEnv.length !== 0) {
      violations.push(`${contractPath}: strictExternalBetaReady requires no external blockers or missing env`);
    }
  }
  if (contract.cleanEnvMustRemainBlocked === true) {
    assertSameSet(
      cleanStatus.missingRequiredEnv,
      evidenceDryRun.requiredMissingEnvWithoutCredentials ?? [],
      `${contractPath}: clean-env missingRequiredEnv`,
    );
    if (cleanStatus.externalEvidenceEnvReadinessPercent !== 0) {
      violations.push(`${contractPath}: clean-env status must keep external evidence readiness at 0`);
    }
    if (cleanStatus.externalBlockerJobCount === 0) {
      violations.push(`${contractPath}: clean-env status must expose external blocker jobs`);
    }
  }
}

function validateActiveExternalBlockerSemantics() {
  const semanticStatus = buildStatus({
    jobCount: 3,
    localContractJobCount: 1,
    liveCommandJobCount: 1,
    manualArtifactJobCount: 1,
    executableLiveJobCount: 0,
    liveArtifactReadyForValidationJobCount: 0,
    manualArtifactReadyForValidationJobCount: 1,
    externalBlockerJobCount: 3,
    contractClosurePercent: 33,
    externalEvidenceEnvReadinessPercent: 50,
    blockedMissingRequiredEnvJobCount: 1,
    blockedInvalidInputJobCount: 0,
    blockedLocalRuntimeEnvJobCount: 0,
    readinessCounts: {
      local_contract_ready: 1,
      manual_artifact_required: 1,
      blocked_missing_required_env: 1,
    },
    uniqueMissingEnv: ['REDDIT_REFRESH_TOKEN'],
    uniqueMissingOptionalEnv: [],
    jobs: [
      {
        jobId: 'release-baseline-freeze',
        blocksExternalBeta: true,
        executionReadiness: 'local_contract_ready',
        missingEnv: [],
        preflightViolations: [],
      },
      {
        jobId: 'durable-runtime-staging-proof',
        blocksExternalBeta: true,
        executionReadiness: 'manual_artifact_required',
        missingEnv: [],
        preflightViolations: [],
      },
      {
        jobId: 'live-reddit-oauth',
        blocksExternalBeta: true,
        executionReadiness: 'blocked_missing_required_env',
        missingEnv: ['REDDIT_REFRESH_TOKEN'],
        preflightViolations: [],
      },
    ],
  });

  if (semanticStatus.externalBlockerJobCount !== 1) {
    violations.push(`${contractPath}: externalBlockerJobCount must count active evidence blockers only`);
  }
  if (semanticStatus.totalExternalBetaBlockingJobCount !== 3) {
    violations.push(`${contractPath}: totalExternalBetaBlockingJobCount must preserve total policy-blocking jobs`);
  }
  if (semanticStatus.externalEvidenceReadyJobCount !== 1 || semanticStatus.externalEvidenceTotalJobCount !== 2) {
    violations.push(`${contractPath}: status must expose live/manual evidence ready and total job counts`);
  }
  if (semanticStatus.activeExternalEvidenceBlockerJobs.length !== 1) {
    violations.push(`${contractPath}: status must expose active external evidence blocker jobs`);
  }
}

function validateLocalRuntimeStatusSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'backend-mvp-status-local-runtime-'));
  try {
    const localPlan = readEvidencePlan({
      cleanEnv: false,
      envOverride: {
        API_BASE_URL: 'http://127.0.0.1:3000?access_token=status-api-token-value-1234567890',
        BACKEND_IMAGE_DIGEST: `sha256:${'a'.repeat(64)}`,
        DATABASE_URL: 'postgresql://status_user:...@127.0.0.1:54329/social_monitor',
        DURABLE_BACKEND_E2E_ARTIFACT_PATH: join(tempDirectory, 'durable-backend-e2e.json'),
        RABBITMQ_URL: 'amqp://status_user:...@127.0.0.1:56729/social_monitor',
        REDDIT_ACCESS_TOKEN: 'reddit-status-access-value-1234567890',
        STAGING_ENVIRONMENT_ID: 'docker-alpha-1',
      },
    });
    const localStatus = buildStatus(localPlan);
    if (localStatus.blockedLocalRuntimeEnvJobCount < 1) {
      violations.push(`${contractPath}: local runtime status smoke must expose blockedLocalRuntimeEnvJobCount`);
    }
    if ((localStatus.evidenceReadinessCounts.blocked_local_runtime_env ?? 0) < 1) {
      violations.push(`${contractPath}: local runtime status smoke must expose blocked_local_runtime_env readiness`);
    }
    if (localStatus.blockedInvalidInputJobCount !== 0) {
      violations.push(`${contractPath}: local runtime status smoke must not classify local runtime env as generic invalid input`);
    }
    if (localStatus.strictExternalBetaReady !== false) {
      violations.push(`${contractPath}: local runtime status smoke must not mark external beta ready`);
    }
    assertNoStatusOutputSecrets(JSON.stringify(localStatus), [
      'status-api-token-value-1234567890',
      'reddit-status-access-value-1234567890',
      'postgresql://status_user:...@127.0.0.1:54329/social_monitor',
      'amqp://status_user:...@127.0.0.1:56729/social_monitor',
      '127.0.0.1:54329',
      '127.0.0.1:56729',
    ]);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function validateEnvFileStatusSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'backend-mvp-status-env-file-'));
  try {
    const envFilePath = join(tempDirectory, 'status-evidence.env');
    writePrivateStatusEnvFile(envFilePath, {
      API_BASE_URL: 'http://127.0.0.1:3000?access_token=status-env-file-api-token-value-1234567890',
      BACKEND_IMAGE_DIGEST: `sha256:${'b'.repeat(64)}`,
      DATABASE_URL: 'postgresql://status_env_file_user:...@127.0.0.1:54339/social_monitor',
      DURABLE_BACKEND_E2E_ARTIFACT_PATH: join(tempDirectory, 'durable-backend-e2e.json'),
      RABBITMQ_URL: 'amqp://status_env_file_user:...@127.0.0.1:56739/social_monitor',
      REDDIT_ACCESS_TOKEN: 'reddit-status-env-file-access-value-1234567890',
      STAGING_ENVIRONMENT_ID: 'docker-alpha-env-file-1',
    });

    const envFilePlan = readEvidencePlan({
      cleanEnv: false,
      envOverride: {
        PATH: process.env.PATH ?? '',
      },
      envFilePaths: [envFilePath],
    });
    const envFileStatus = buildStatus(envFilePlan, { envFileCount: 1 });
    if (envFileStatus.evidenceInputMode !== 'env_file') {
      violations.push(`${contractPath}: env-file status smoke must report evidenceInputMode=env_file`);
    }
    if (envFileStatus.evidenceEnvFileCount !== 1) {
      violations.push(`${contractPath}: env-file status smoke must report one loaded env file`);
    }
    if (envFileStatus.blockedLocalRuntimeEnvJobCount < 1) {
      violations.push(`${contractPath}: env-file status smoke must expose local runtime blockers`);
    }
    if (envFileStatus.strictExternalBetaReady !== false) {
      violations.push(`${contractPath}: env-file status smoke must not mark external beta ready`);
    }
    assertNoStatusOutputSecrets(JSON.stringify(envFileStatus), [
      'status-env-file-api-token-value-1234567890',
      'reddit-status-env-file-access-value-1234567890',
      'postgresql://status_env_file_user:...@127.0.0.1:54339/social_monitor',
      'amqp://status_env_file_user:...@127.0.0.1:56739/social_monitor',
      '127.0.0.1:54339',
      '127.0.0.1:56739',
    ]);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function writePrivateStatusEnvFile(path, entries) {
  const body = Object.entries(entries)
    .map(([name, value]) => `${name}=${quoteEnvValue(String(value))}`)
    .join('\n');
  writeFileSync(path, `${body}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function quoteEnvValue(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function assertNoStatusOutputSecrets(output, forbiddenOutputFragments) {
  for (const fragment of forbiddenOutputFragments) {
    if (String(output).includes(fragment)) {
      violations.push(`${contractPath}: status output must not print raw env value fragment "${fragment}"`);
    }
  }
}

function validateWiring() {
  const backendScripts = new Set(backendSafe.backendScripts ?? []);
  const baselineScripts = new Set(baseline.requiredGreenScripts ?? []);
  const baselineArtifacts = new Set((baseline.trackedArtifacts ?? []).map((artifact) => artifact.path));
  const releaseGateIds = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.gateId));
  const releaseGateCommands = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.command));
  const externalDomain = (backendOps.requiredDomains ?? []).find((domain) => domain.domainId === 'external-beta-evidence');

  if (scripts['check:backend-mvp-status'] !== 'node scripts/check-backend-mvp-status.mjs') {
    violations.push(`${packagePath}: check:backend-mvp-status must run the status checker`);
  }
  if (scripts['backend:mvp:status:json'] !== 'node scripts/check-backend-mvp-status.mjs --json') {
    violations.push(`${packagePath}: backend:mvp:status:json must emit status JSON`);
  }
  if (
    scripts['backend:mvp:status:current'] !==
    'node scripts/check-backend-mvp-status.mjs --json --env-file /tmp/social-monitor-evidence/external-beta-current-package.env'
  ) {
    violations.push(`${packagePath}: backend:mvp:status:current must emit status JSON for the current packaged evidence env file`);
  }
  if (contract.currentEvidenceStatusJsonCommand !== 'npm run --silent backend:mvp:status:current') {
    violations.push(`${contractPath}: currentEvidenceStatusJsonCommand must point to backend:mvp:status:current`);
  }
  if (!backendScripts.has('check:backend-mvp-status')) {
    violations.push(`${backendSafePath}: backendScripts must include check:backend-mvp-status`);
  }
  if (!baselineScripts.has('check:backend-mvp-status')) {
    violations.push(`${baselinePath}: requiredGreenScripts must include check:backend-mvp-status`);
  }
  if (!baselineArtifacts.has(contractPath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include ${contractPath}`);
  }
  if (!releaseGateIds.has(contract.releaseGateId)) {
    violations.push(`${releaseContractPath}: requiredGates must include ${contract.releaseGateId}`);
  }
  if (!releaseGateCommands.has(contract.checkCommand)) {
    violations.push(`${releaseContractPath}: requiredGates must include ${contract.checkCommand}`);
  }
  if (externalDomain === undefined) {
    violations.push(`${backendOpsPath}: external-beta-evidence domain is required`);
    return;
  }
  if (!externalDomain.gates?.includes('check:backend-mvp-status')) {
    violations.push(`${backendOpsPath}: external-beta-evidence domain must include check:backend-mvp-status`);
  }
  if (!externalDomain.releaseGateIds?.includes(contract.releaseGateId)) {
    violations.push(`${backendOpsPath}: external-beta-evidence domain must include ${contract.releaseGateId}`);
  }
  if (!externalDomain.artifacts?.includes(contractPath)) {
    violations.push(`${backendOpsPath}: external-beta-evidence domain must include ${contractPath}`);
  }
}

function countBy(values, callback) {
  return values.reduce((counts, value) => {
    const key = callback(value);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function readStatusEnvFileSelection(argv) {
  const paths = [];
  const errors = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--env-file') {
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined || value.trim() === '' || value.startsWith('--')) {
      errors.push('--env-file requires a non-empty absolute env file path');
      continue;
    }
    paths.push(value.trim());
    index += 1;
  }

  return { paths, errors };
}

function percent(numerator, denominator) {
  if (denominator <= 0) {
    return 0;
  }
  return Math.round((numerator / denominator) * 100);
}

function assertSameSet(actual, expected, label) {
  const actualSorted = [...new Set(actual)].sort();
  const expectedSorted = [...new Set(expected)].sort();
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    violations.push(`${label}: expected [${expectedSorted.join(', ')}], got [${actualSorted.join(', ')}]`);
  }
}
