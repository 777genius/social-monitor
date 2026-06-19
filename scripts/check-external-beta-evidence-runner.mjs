import { existsSync, readFileSync } from 'node:fs';

const contractPath = 'ops/release/external-beta-evidence-runner.json';
const externalReadinessPath = 'ops/release/external-beta-readiness-contract.json';
const auditPath = 'ops/release/backend-mvp-completion-audit.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';
const packagePath = 'package.json';

const contract = readJson(contractPath);
const externalReadiness = readJson(externalReadinessPath);
const audit = readJson(auditPath);
const backendSafe = readJson(backendSafePath);
const baseline = readJson(baselinePath);
const packageJson = readJson(packagePath);
const runnerSource = readFileSync(contract.runnerFile, 'utf8');
const envExampleSource = typeof contract.envExample === 'string' && existsSync(contract.envExample)
  ? readFileSync(contract.envExample, 'utf8')
  : '';
const packageScripts = packageJson.scripts ?? {};
const backendScripts = new Set(backendSafe.backendScripts ?? []);
const baselineScripts = new Set(baseline.requiredGreenScripts ?? []);
const baselineArtifacts = new Set((baseline.trackedArtifacts ?? []).map((artifact) => artifact.path));
const externalGroups = new Map((externalReadiness.requiredEvidenceGroups ?? []).map((group) => [group.groupId, group]));
const auditRequirements = new Map((audit.requirements ?? []).map((requirement) => [requirement.requirementId, requirement]));
const violations = [];

const allowedModes = new Set([
  'local_contract',
  'live_network',
  'redacted_samples',
  'staging_artifact',
  'staging_deploy',
]);
const allowedRunPolicies = new Set([
  'live_command',
  'local_contract',
  'manual_artifact_then_validator',
]);
const forbiddenFragments = [
  'frontend',
  'mobile',
  'flutter',
  'agent-runtime',
  'claude-hooks',
];
const forbiddenLiteralFragments = [
  'bearer ',
  'basic ',
  'private_key',
  'client_secret=',
  'postgres://',
  'postgresql://',
  'amqp://',
  'amqps://',
  'smk_',
  'whsec_',
];
const requiredJobEnvNames = new Map([
  [
    'durable-runtime-staging-proof',
    [
      'STAGING_ENVIRONMENT_ID',
      'BACKEND_IMAGE_DIGEST',
      'API_BASE_URL',
      'DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH',
    ],
  ],
  [
    'live-open-connectors',
    [
      'LIVE_OPEN_CONNECTORS_EVIDENCE_PATH',
      'SOURCE_LIVE_ENVIRONMENT_ID',
      'BACKEND_IMAGE_DIGEST',
      'SOURCE_LIVE_OPERATOR',
    ],
  ],
  [
    'live-reddit-oauth',
    [
      'REDDIT_ACCESS_TOKEN',
      'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH',
      'REDDIT_LIVE_EVIDENCE_PATH',
      'SOURCE_LIVE_ENVIRONMENT_ID',
      'BACKEND_IMAGE_DIGEST',
      'SOURCE_LIVE_OPERATOR',
    ],
  ],
  ['summary-real-feedback-import', ['SUMMARY_REAL_FEEDBACK_SAMPLES_PATH']],
  [
    'security-final-sweep-staging',
    [
      'SECURITY_FINAL_SWEEP_ARTIFACT_PATH',
      'LOG_EXPORT_PATH',
      'METRICS_EXPORT_PATH',
      'PUBLIC_ERROR_EXPORT_PATH',
    ],
  ],
  [
    'credential-secret-rotation-drill',
    [
      'STAGING_SECRET_STORE_ID',
      'SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH',
      'WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH',
    ],
  ],
  [
    'rabbitmq-staging-reliability-drill',
    [
      'RABBITMQ_URL',
      'STAGING_ENVIRONMENT_ID',
      'BACKEND_IMAGE_DIGEST',
      'RABBITMQ_STAGING_DRILL_ARTIFACT_PATH',
    ],
  ],
  [
    'postgres-restore-migration-drill',
    [
      'DATABASE_URL',
      'STAGING_ENVIRONMENT_ID',
      'BACKEND_IMAGE_DIGEST',
      'POSTGRES_RESTORE_DRILL_ARTIFACT_PATH',
    ],
  ],
  [
    'durable-backend-e2e-loop',
    [
      'API_BASE_URL',
      'STAGING_ENVIRONMENT_ID',
      'BACKEND_IMAGE_DIGEST',
      'DURABLE_BACKEND_E2E_ARTIFACT_PATH',
    ],
  ],
  [
    'release-deploy-smoke',
    [
      'RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH',
      'STAGING_ENVIRONMENT_ID',
      'BACKEND_IMAGE_DIGEST',
      'API_BASE_URL',
    ],
  ],
]);
const requiredJobOptionalEnvNames = new Map([
  ['live-open-connectors', ['GITHUB_ACCESS_TOKEN']],
  ['live-reddit-oauth', ['REDDIT_USER_AGENT', 'REDDIT_SUBREDDIT', 'REDDIT_LISTING']],
]);
const requiredJobOutputArtifacts = new Map([
  [
    'durable-runtime-staging-proof',
    [
      { kind: 'path', ref: 'ops/release/durable-runtime-proof.json', format: 'durable-runtime-proof-contract-v1' },
      { kind: 'env', ref: 'DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH', format: 'durable-runtime-selector-artifact-v1' },
    ],
  ],
  [
    'live-open-connectors',
    [
      { kind: 'env', ref: 'LIVE_OPEN_CONNECTORS_EVIDENCE_PATH', format: 'source-live-provider-evidence-v1' },
    ],
  ],
  [
    'live-reddit-oauth',
    [
      { kind: 'env', ref: 'REDDIT_LIVE_EVIDENCE_PATH', format: 'source-live-provider-evidence-v1' },
      { kind: 'env', ref: 'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH', format: 'reddit-credential-lifecycle-redacted-v1' },
    ],
  ],
  [
    'summary-real-feedback-import',
    [
      { kind: 'env', ref: 'SUMMARY_REAL_FEEDBACK_SAMPLES_PATH', format: 'redacted-summary-feedback-samples-v1' },
    ],
  ],
  [
    'security-final-sweep-staging',
    [
      { kind: 'env', ref: 'SECURITY_FINAL_SWEEP_ARTIFACT_PATH', format: 'security-final-sweep-staging-artifact-v1' },
    ],
  ],
  [
    'credential-secret-rotation-drill',
    [
      { kind: 'path', ref: 'ops/security/credential-secret-runtime-flow.json', format: 'credential-secret-runtime-flow-v1' },
      { kind: 'env', ref: 'SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH', format: 'source-credential-rotation-redacted-v1' },
      { kind: 'env', ref: 'WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH', format: 'webhook-secret-rotation-redacted-v1' },
    ],
  ],
  [
    'rabbitmq-staging-reliability-drill',
    [
      { kind: 'env', ref: 'RABBITMQ_STAGING_DRILL_ARTIFACT_PATH', format: 'staging-reliability-artifact-v1' },
    ],
  ],
  [
    'postgres-restore-migration-drill',
    [
      { kind: 'env', ref: 'POSTGRES_RESTORE_DRILL_ARTIFACT_PATH', format: 'staging-reliability-artifact-v1' },
    ],
  ],
  [
    'durable-backend-e2e-loop',
    [
      { kind: 'env', ref: 'DURABLE_BACKEND_E2E_ARTIFACT_PATH', format: 'staging-reliability-artifact-v1' },
    ],
  ],
  [
    'release-deploy-smoke',
    [
      { kind: 'env', ref: 'RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH', format: 'release-deploy-smoke-artifact-v1' },
    ],
  ],
]);

if (contract.schemaVersion !== 1) {
  violations.push(`${contractPath}: schemaVersion must be 1`);
}
if (contract.scope !== 'backend-only') {
  violations.push(`${contractPath}: scope must be backend-only`);
}
if (contract.frontendPolicy !== 'deferred_contract_only') {
  violations.push(`${contractPath}: frontendPolicy must keep frontend deferred`);
}
if (contract.defaultMode !== 'plan_only') {
  violations.push(`${contractPath}: defaultMode must be plan_only`);
}
for (const field of ['runnerFile', 'checkFile', 'envExample']) {
  if (!existsSync(contract[field] ?? '')) {
    violations.push(`${contractPath}: ${field} must reference an existing file`);
  }
}

validateCommand(contract.checkCommand, `${contractPath}: checkCommand`);
validateCommand(contract.planCommand, `${contractPath}: planCommand`);
validateCommand(contract.jsonPlanCommand, `${contractPath}: jsonPlanCommand`);
validateCommand(contract.preflightCommand, `${contractPath}: preflightCommand`);
validateCommand(contract.artifactValidationCommand, `${contractPath}: artifactValidationCommand`);
validateCommand(contract.executeCommand, `${contractPath}: executeCommand`);
validateSafety();
validateRunnerImplementation();
validateJobs();
validateEnvExample();
validateWiring();
validateNoSensitiveLiterals();

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('External beta evidence runner contract OK');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function validateSafety() {
  const safety = contract.executionSafety;
  if (typeof safety !== 'object' || safety === null) {
    violations.push(`${contractPath}: executionSafety is required`);
    return;
  }
  if (!safety.liveExecutionRequires?.includes('--execute')) {
    violations.push(`${contractPath}: executionSafety.liveExecutionRequires must include --execute`);
  }
  if (!safety.liveExecutionRequires?.includes('EXTERNAL_BETA_EVIDENCE_CONFIRM=run-live')) {
    violations.push(`${contractPath}: executionSafety.liveExecutionRequires must include confirmation env`);
  }
  if (safety.defaultActionWithoutExecute !== 'print_plan_only') {
    violations.push(`${contractPath}: executionSafety.defaultActionWithoutExecute must be print_plan_only`);
  }
  if (safety.manualArtifactJobsFailExecute !== true) {
    violations.push(`${contractPath}: executionSafety.manualArtifactJobsFailExecute must be true`);
  }
  if (safety.artifactValidationSkipsLiveRunners !== true) {
    violations.push(`${contractPath}: executionSafety.artifactValidationSkipsLiveRunners must be true`);
  }
  if (safety.secretValuesMustStayOutOfArtifacts !== true) {
    violations.push(`${contractPath}: executionSafety.secretValuesMustStayOutOfArtifacts must be true`);
  }
  for (const forbidden of forbiddenFragments) {
    if (!safety.forbiddenTargets?.includes(forbidden)) {
      violations.push(`${contractPath}: executionSafety.forbiddenTargets must include ${forbidden}`);
    }
  }
}

function validateRunnerImplementation() {
  for (const marker of [
    'unknownJobIds',
    'Unknown external beta evidence job id(s)',
    'Known jobs:',
    'executableJobViolations',
    'Refusing to execute external beta evidence jobs. Resolve all preflight violations first:',
    'printJsonPlan',
    'uniqueMissingEnv',
    'readSelectedJobSelection',
    'Invalid external beta evidence job selection:',
    '--jobs requires at least one job id',
    'missingOptionalEnvCount',
    'uniqueMissingOptionalEnv',
    'jobExecutionReadiness',
    'blocked_missing_required_env',
    'manualArtifactJobCount',
    'executableLiveJobCount',
    'validateArtifacts',
    'artifactValidationViolations',
    'Refusing to validate external beta evidence artifacts',
    'output artifact env',
    'readJsonArtifact',
    'valid JSON artifact',
    'artifactFormat',
    'must use format',
    'forbiddenEvidencePathFragments',
    'isFixtureLikeArtifactPath',
    'must not point to fixture or example evidence',
    'schemaVersion 1',
    'validateEvidencePathEnv',
    'evidence path env',
  ]) {
    if (!runnerSource.includes(marker)) {
      violations.push(`${contract.runnerFile}: runner must fail fast before executing unsafe job selections`);
    }
  }
}

function validateJobs() {
  if (!Array.isArray(contract.jobs) || contract.jobs.length === 0) {
    violations.push(`${contractPath}: jobs must be a non-empty array`);
    return;
  }

  const jobIds = new Set();
  const coveredGroups = new Set();
  const coveredRequirements = new Set();
  const sourceJobs = new Set();

  for (const job of contract.jobs) {
    const label = `${contractPath}: job "${job.jobId ?? '<missing>'}"`;
    if (jobIds.has(job.jobId)) {
      violations.push(`${contractPath}: duplicate jobId "${job.jobId}"`);
    }
    jobIds.add(job.jobId);
    coveredGroups.add(job.evidenceGroupId);
    coveredRequirements.add(job.requirementId);

    validateJobBasics(job, label);
    validateJobCommands(job, label);
    validateJobEnvironment(job, label);
    validateJobArtifacts(job, label);
    validateRequiredJobEvidence(job, label);
    validateJobScopeSafety(job, label);

    if (job.evidenceGroupId === 'source-provider-live-certification') {
      sourceJobs.add(job.jobId);
    }
  }

  for (const groupId of externalGroups.keys()) {
    if (!coveredGroups.has(groupId)) {
      violations.push(`${contractPath}: jobs must cover external readiness group "${groupId}"`);
    }
  }
  for (const requirementId of auditRequirements.keys()) {
    if (!coveredRequirements.has(requirementId)) {
      violations.push(`${contractPath}: jobs must cover backend MVP requirement "${requirementId}"`);
    }
  }
  for (const requiredSourceJob of ['live-open-connectors', 'live-reddit-oauth']) {
    if (!sourceJobs.has(requiredSourceJob)) {
      violations.push(`${contractPath}: source live certification must include ${requiredSourceJob}`);
    }
  }
}

function validateEnvExample() {
  if (envExampleSource.trim().length === 0) {
    violations.push(`${contractPath}: envExample must reference a non-empty env example file`);
    return;
  }

  const expectedEnvNames = new Set([
    'EXTERNAL_BETA_EVIDENCE_CONFIRM',
    ...contract.jobs.flatMap((job) => job.requiredEnv ?? []),
    ...contract.jobs.flatMap((job) => job.optionalEnv ?? []),
  ]);
  const actualEnvNames = new Set();

  for (const [lineIndex, line] of envExampleSource.split('\n').entries()) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(trimmed);
    if (match === null) {
      violations.push(`${contract.envExample}:${lineIndex + 1}: env example line must be KEY=`);
      continue;
    }

    const [, envName, value] = match;
    if (actualEnvNames.has(envName)) {
      violations.push(`${contract.envExample}: duplicate env example entry "${envName}"`);
    }
    actualEnvNames.add(envName);

    if (!expectedEnvNames.has(envName)) {
      violations.push(`${contract.envExample}: unexpected env example entry "${envName}"`);
    }
    if (value.trim().length > 0) {
      violations.push(`${contract.envExample}: env example entry "${envName}" must not commit a value`);
    }
  }

  for (const envName of expectedEnvNames) {
    if (!actualEnvNames.has(envName)) {
      violations.push(`${contract.envExample}: missing env example entry "${envName}"`);
    }
  }
}

function validateJobBasics(job, label) {
  for (const field of ['jobId', 'evidenceGroupId', 'requirementId', 'mode', 'runPolicy', 'owner', 'exitCondition']) {
    if (typeof job[field] !== 'string' || job[field].trim().length === 0) {
      violations.push(`${label}: ${field} must be a non-empty string`);
    }
  }
  if (!allowedModes.has(job.mode)) {
    violations.push(`${label}: unsupported mode "${job.mode}"`);
  }
  if (!allowedRunPolicies.has(job.runPolicy)) {
    violations.push(`${label}: unsupported runPolicy "${job.runPolicy}"`);
  }
  if (job.blocksExternalBeta !== true) {
    violations.push(`${label}: blocksExternalBeta must be true`);
  }

  const group = externalGroups.get(job.evidenceGroupId);
  if (group === undefined) {
    violations.push(`${label}: evidenceGroupId must reference external beta readiness group`);
  } else if (job.owner !== group.owner) {
    violations.push(`${label}: owner must match external readiness group owner "${group.owner}"`);
  }

  const requirement = auditRequirements.get(job.requirementId);
  if (requirement === undefined) {
    violations.push(`${label}: requirementId must reference backend MVP completion audit requirement`);
  } else if (requirement.externalReadinessGroupId !== job.evidenceGroupId) {
    violations.push(`${label}: requirementId must map to evidenceGroupId "${job.evidenceGroupId}"`);
  }
}

function validateJobCommands(job, label) {
  if (!Array.isArray(job.validationCommands) || job.validationCommands.length === 0) {
    violations.push(`${label}: validationCommands must be non-empty`);
  } else {
    for (const command of job.validationCommands) {
      validateCommand(command, `${label}: validationCommands`);
    }
  }

  if (job.runPolicy === 'live_command') {
    if (typeof job.runnerCommand !== 'string' || job.runnerCommand.trim().length === 0) {
      violations.push(`${label}: live_command requires runnerCommand`);
    } else {
      validateCommand(job.runnerCommand, `${label}: runnerCommand`);
      const scriptName = scriptNameFromCommand(job.runnerCommand);
      if (backendScripts.has(scriptName)) {
        violations.push(`${label}: live runnerCommand must not be included in backend-safe verify`);
      }
    }
    if (job.mode !== 'live_network') {
      violations.push(`${label}: live_command must use mode live_network`);
    }
  }

  if (job.runPolicy === 'manual_artifact_then_validator' && job.runnerCommand !== null) {
    violations.push(`${label}: manual_artifact_then_validator must keep runnerCommand=null`);
  }
  if (job.runPolicy === 'local_contract' && job.runnerCommand !== null) {
    violations.push(`${label}: local_contract must keep runnerCommand=null`);
  }
}

function validateJobEnvironment(job, label) {
  for (const field of ['requiredEnv', 'optionalEnv']) {
    if (!Array.isArray(job[field])) {
      violations.push(`${label}: ${field} must be an array`);
      continue;
    }
    const seen = new Set();
    for (const envName of job[field]) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(String(envName))) {
        violations.push(`${label}: ${field} contains invalid env name "${envName}"`);
      }
      if (seen.has(envName)) {
        violations.push(`${label}: ${field} contains duplicate env name "${envName}"`);
      }
      seen.add(envName);
    }
  }

  if (job.runPolicy !== 'local_contract' && job.requiredEnv.length === 0) {
    violations.push(`${label}: non-local job must define requiredEnv`);
  }
}

function validateJobArtifacts(job, label) {
  if (!Array.isArray(job.outputArtifacts) || job.outputArtifacts.length === 0) {
    violations.push(`${label}: outputArtifacts must be non-empty`);
    return;
  }

  const envNames = new Set([...(job.requiredEnv ?? []), ...(job.optionalEnv ?? [])]);
  for (const artifact of job.outputArtifacts) {
    if (typeof artifact.format !== 'string' || artifact.format.trim().length === 0) {
      violations.push(`${label}: output artifact must define format`);
    }
    if (artifact.path === undefined && artifact.env === undefined) {
      violations.push(`${label}: output artifact must define path or env`);
    }
    if (artifact.path !== undefined && !existsSync(artifact.path)) {
      violations.push(`${label}: output artifact path must exist: ${artifact.path}`);
    }
    if (artifact.env !== undefined && !envNames.has(artifact.env)) {
      violations.push(`${label}: output artifact env "${artifact.env}" must be listed in requiredEnv or optionalEnv`);
    }
  }
}

function validateRequiredJobEvidence(job, label) {
  const envNames = new Set([...(job.requiredEnv ?? []), ...(job.optionalEnv ?? [])]);
  const requiredEnvNames = requiredJobEnvNames.get(job.jobId) ?? [];
  for (const envName of requiredEnvNames) {
    if (!envNames.has(envName)) {
      violations.push(`${label}: must include required evidence env "${envName}"`);
    }
  }
  const optionalEnvNames = new Set(job.optionalEnv ?? []);
  const requiredOptionalEnvNames = requiredJobOptionalEnvNames.get(job.jobId) ?? [];
  for (const envName of requiredOptionalEnvNames) {
    if (!optionalEnvNames.has(envName)) {
      violations.push(`${label}: must include optional evidence env "${envName}"`);
    }
  }

  const requiredArtifacts = requiredJobOutputArtifacts.get(job.jobId) ?? [];
  for (const requiredArtifact of requiredArtifacts) {
    const hasArtifact = (job.outputArtifacts ?? []).some((artifact) => {
      const refMatches = requiredArtifact.kind === 'path'
        ? artifact.path === requiredArtifact.ref
        : artifact.env === requiredArtifact.ref;
      return refMatches && artifact.format === requiredArtifact.format;
    });
    if (!hasArtifact) {
      violations.push(
        `${label}: outputArtifacts must include ${requiredArtifact.kind} "${requiredArtifact.ref}" with format "${requiredArtifact.format}"`,
      );
    }
  }
}

function validateJobScopeSafety(job, label) {
  const searchable = JSON.stringify({
    jobId: job.jobId,
    mode: job.mode,
    runnerCommand: job.runnerCommand,
    validationCommands: job.validationCommands,
    outputArtifacts: job.outputArtifacts,
  }).toLowerCase();

  for (const fragment of forbiddenFragments) {
    if (searchable.includes(fragment)) {
      violations.push(`${label}: must not reference forbidden target fragment "${fragment}"`);
    }
  }
}

function validateWiring() {
  const checkScript = scriptNameFromCommand(contract.checkCommand);
  const planScript = scriptNameFromCommand(contract.planCommand);
  const jsonPlanScript = scriptNameFromCommand(contract.jsonPlanCommand);
  const preflightScript = scriptNameFromCommand(contract.preflightCommand);
  const artifactValidationScript = scriptNameFromCommand(contract.artifactValidationCommand);
  const executeScript = scriptNameFromCommand(contract.executeCommand);

  for (const scriptName of [
    checkScript,
    planScript,
    jsonPlanScript,
    preflightScript,
    artifactValidationScript,
    executeScript,
  ]) {
    if (!packageScripts[scriptName]) {
      violations.push(`${packagePath}: missing npm script "${scriptName}"`);
    }
  }
  if (!String(packageScripts[jsonPlanScript] ?? '').includes('--json')) {
    violations.push(`${packagePath}: ${jsonPlanScript} must pass --json`);
  }
  if (!String(packageScripts[preflightScript] ?? '').includes('--require-env')) {
    violations.push(`${packagePath}: ${preflightScript} must pass --require-env`);
  }
  if (!String(packageScripts[artifactValidationScript] ?? '').includes('--validate-artifacts')) {
    violations.push(`${packagePath}: ${artifactValidationScript} must pass --validate-artifacts`);
  }
  if (!String(packageScripts[artifactValidationScript] ?? '').includes('--require-env')) {
    violations.push(`${packagePath}: ${artifactValidationScript} must pass --require-env`);
  }
  if (!backendScripts.has(checkScript)) {
    violations.push(`${backendSafePath}: backendScripts must include ${checkScript}`);
  }
  for (const scriptName of [planScript, jsonPlanScript, preflightScript, artifactValidationScript, executeScript]) {
    if (backendScripts.has(scriptName)) {
      violations.push(`${backendSafePath}: backend-safe verify must not run ${scriptName}`);
    }
  }
  if (!baselineScripts.has(checkScript)) {
    violations.push(`${baselinePath}: requiredGreenScripts must include ${checkScript}`);
  }
  if (!baselineArtifacts.has(contractPath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include ${contractPath}`);
  }

  const evidenceRunner = externalReadiness.evidenceRunner;
  if (typeof evidenceRunner !== 'object' || evidenceRunner === null) {
    violations.push(`${externalReadinessPath}: evidenceRunner is required`);
    return;
  }
  if (evidenceRunner.contract !== contractPath) {
    violations.push(`${externalReadinessPath}: evidenceRunner.contract must be ${contractPath}`);
  }
  if (evidenceRunner.checkCommand !== contract.checkCommand) {
    violations.push(`${externalReadinessPath}: evidenceRunner.checkCommand must match runner contract`);
  }
  if (evidenceRunner.planCommand !== contract.planCommand) {
    violations.push(`${externalReadinessPath}: evidenceRunner.planCommand must match runner contract`);
  }
  if (evidenceRunner.jsonPlanCommand !== contract.jsonPlanCommand) {
    violations.push(`${externalReadinessPath}: evidenceRunner.jsonPlanCommand must match runner contract`);
  }
  if (evidenceRunner.preflightCommand !== contract.preflightCommand) {
    violations.push(`${externalReadinessPath}: evidenceRunner.preflightCommand must match runner contract`);
  }
  if (evidenceRunner.artifactValidationCommand !== contract.artifactValidationCommand) {
    violations.push(`${externalReadinessPath}: evidenceRunner.artifactValidationCommand must match runner contract`);
  }
}

function validateNoSensitiveLiterals() {
  const serialized = JSON.stringify(contract).toLowerCase();
  for (const fragment of forbiddenLiteralFragments) {
    if (serialized.includes(fragment)) {
      violations.push(`${contractPath}: contract must not contain sensitive literal fragment "${fragment}"`);
    }
  }
}

function validateCommand(command, label) {
  const scriptName = scriptNameFromCommand(command);
  if (scriptName === null) {
    violations.push(`${label}: command must use npm run`);
    return;
  }
  if (!packageScripts[scriptName]) {
    violations.push(`${label}: references missing npm script "${scriptName}"`);
  }
}

function scriptNameFromCommand(command) {
  const match = /^npm run (?:--silent )?([^ ]+)/.exec(String(command ?? ''));
  return match?.[1] ?? null;
}
