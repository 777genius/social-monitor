import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
      {
        kind: 'env',
        ref: 'LIVE_OPEN_CONNECTORS_EVIDENCE_PATH',
        format: 'source-live-provider-evidence-v1',
        expectedArtifactId: 'live-open-connectors-evidence-v1',
        expectedProviderKeys: ['hacker-news', 'rss', 'github'],
      },
    ],
  ],
  [
    'live-reddit-oauth',
    [
      {
        kind: 'env',
        ref: 'REDDIT_LIVE_EVIDENCE_PATH',
        format: 'source-live-provider-evidence-v1',
        expectedArtifactId: 'live-reddit-oauth-evidence-v1',
        expectedProviderKeys: ['reddit'],
      },
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
      {
        kind: 'env',
        ref: 'RABBITMQ_STAGING_DRILL_ARTIFACT_PATH',
        format: 'staging-reliability-artifact-v1',
        expectedArtifactId: 'rabbitmq-staging-drill-output',
      },
    ],
  ],
  [
    'postgres-restore-migration-drill',
    [
      {
        kind: 'env',
        ref: 'POSTGRES_RESTORE_DRILL_ARTIFACT_PATH',
        format: 'staging-reliability-artifact-v1',
        expectedArtifactId: 'postgres-restore-drill-output',
      },
    ],
  ],
  [
    'durable-backend-e2e-loop',
    [
      {
        kind: 'env',
        ref: 'DURABLE_BACKEND_E2E_ARTIFACT_PATH',
        format: 'staging-reliability-artifact-v1',
        expectedArtifactId: 'durable-backend-e2e-output',
      },
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
validateCommand(contract.summaryCommand, `${contractPath}: summaryCommand`);
validateCommand(contract.handoffCommand, `${contractPath}: handoffCommand`);
validateCommand(contract.handoffJsonCommand, `${contractPath}: handoffJsonCommand`);
validateCommand(contract.preflightCommand, `${contractPath}: preflightCommand`);
validateCommand(contract.artifactValidationCommand, `${contractPath}: artifactValidationCommand`);
validateCommand(contract.executeCommand, `${contractPath}: executeCommand`);
validateSafety();
validateArtifactFreshnessPolicy();
validateArtifactExamples();
validateRunnerImplementation();
validateRunnerPositiveDurableRuntimeArtifactSmoke();
validateRunnerNegativeDurableRuntimeArtifactSmokes();
validateRunnerPositiveCredentialRotationArtifactSmoke();
validateRunnerNegativeCredentialRotationArtifactSmokes();
validateRunnerPositiveSecurityFinalSweepArtifactSmoke();
validateRunnerNegativeSecurityFinalSweepArtifactSmokes();
validateRunnerPositiveStagingReliabilityArtifactSmokes();
validateRunnerNegativeStagingReliabilityArtifactSmokes();
validateRunnerPositiveArtifactSmoke();
validateRunnerPositiveRedditArtifactSmoke();
validateRunnerNegativeRedditArtifactSmokes();
validateRunnerNegativeSmokes();
validateRunnerPreflightNegativeSmokes();
validateRunnerPreflightPositiveSmoke();
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
  if (safety.liveExecutionValidatesOutputPathsBeforeRun !== true) {
    violations.push(`${contractPath}: executionSafety.liveExecutionValidatesOutputPathsBeforeRun must be true`);
  }
  if (safety.preflightRequiresEnvValueValidation !== true) {
    violations.push(`${contractPath}: executionSafety.preflightRequiresEnvValueValidation must be true`);
  }
  if (safety.preflightRequiresEvidencePathValidation !== true) {
    violations.push(`${contractPath}: executionSafety.preflightRequiresEvidencePathValidation must be true`);
  }
  if (safety.secretValuesMustStayOutOfArtifacts !== true) {
    violations.push(`${contractPath}: executionSafety.secretValuesMustStayOutOfArtifacts must be true`);
  }
  if (safety.criticalEnvValuesMustBeTyped !== true) {
    violations.push(`${contractPath}: executionSafety.criticalEnvValuesMustBeTyped must be true`);
  }
  if (safety.evidencePathEnvRequiresAbsolutePath !== true) {
    violations.push(`${contractPath}: executionSafety.evidencePathEnvRequiresAbsolutePath must be true`);
  }
  if (safety.evidencePathEnvRequiresRegularFile !== true) {
    violations.push(`${contractPath}: executionSafety.evidencePathEnvRequiresRegularFile must be true`);
  }
  if (!Number.isFinite(safety.evidencePathEnvMaxBytes) || safety.evidencePathEnvMaxBytes <= 0) {
    violations.push(`${contractPath}: executionSafety.evidencePathEnvMaxBytes must be positive`);
  }
  if (safety.evidencePathEnvRequiresJsonExtension !== true) {
    violations.push(`${contractPath}: executionSafety.evidencePathEnvRequiresJsonExtension must be true`);
  }
  if (safety.evidencePathEnvRequiresJsonContent !== true) {
    violations.push(`${contractPath}: executionSafety.evidencePathEnvRequiresJsonContent must be true`);
  }
  if (safety.evidencePathEnvForbidsWorkspacePath !== true) {
    violations.push(`${contractPath}: executionSafety.evidencePathEnvForbidsWorkspacePath must be true`);
  }
  if (safety.evidencePathEnvRequiresWritableParent !== true) {
    violations.push(`${contractPath}: executionSafety.evidencePathEnvRequiresWritableParent must be true`);
  }
  if (safety.evidencePathEnvForbidsDuplicatePaths !== true) {
    violations.push(`${contractPath}: executionSafety.evidencePathEnvForbidsDuplicatePaths must be true`);
  }
  if (safety.outputArtifactPathEnvRequiresJsonExtension !== true) {
    violations.push(`${contractPath}: executionSafety.outputArtifactPathEnvRequiresJsonExtension must be true`);
  }
  for (const forbidden of forbiddenFragments) {
    if (!safety.forbiddenTargets?.includes(forbidden)) {
      violations.push(`${contractPath}: executionSafety.forbiddenTargets must include ${forbidden}`);
    }
  }
}

function validateArtifactFreshnessPolicy() {
  const freshness = contract.artifactFreshness;
  if (typeof freshness !== 'object' || freshness === null) {
    violations.push(`${contractPath}: artifactFreshness is required`);
    return;
  }
  if (!Number.isFinite(freshness.maxArtifactAgeHours) || freshness.maxArtifactAgeHours <= 0) {
    violations.push(`${contractPath}: artifactFreshness.maxArtifactAgeHours must be positive`);
  }
  if (!Number.isFinite(freshness.maxArtifactFutureSkewMinutes) || freshness.maxArtifactFutureSkewMinutes < 0) {
    violations.push(`${contractPath}: artifactFreshness.maxArtifactFutureSkewMinutes must be non-negative`);
  }
  if (freshness.requiresIso8601Timestamp !== true) {
    violations.push(`${contractPath}: artifactFreshness.requiresIso8601Timestamp must be true`);
  }

  const timestampPaths = new Set(freshness.timestampPaths ?? []);
  for (const timestampPath of ['sampledAt', 'generatedAt', 'completedAt', 'environment.sampledAt', 'source.sampleWindow.endedAt']) {
    if (!timestampPaths.has(timestampPath)) {
      violations.push(`${contractPath}: artifactFreshness.timestampPaths must include ${timestampPath}`);
    }
  }

  const requiredTimestampFormats = new Set(freshness.requiredTimestampFormats ?? []);
  const envArtifactFormats = new Set(
    contract.jobs
      .flatMap((job) => job.outputArtifacts ?? [])
      .filter((artifact) => artifact.env !== undefined)
      .map((artifact) => artifact.format),
  );
  for (const format of envArtifactFormats) {
    if (!requiredTimestampFormats.has(format)) {
      violations.push(`${contractPath}: artifactFreshness.requiredTimestampFormats must include ${format}`);
    }
  }
}

function validateArtifactExamples() {
  if (!Array.isArray(contract.artifactExamples) || contract.artifactExamples.length === 0) {
    violations.push(`${contractPath}: artifactExamples must be a non-empty array`);
    return;
  }

  const examplesByFormat = new Map();
  for (const example of contract.artifactExamples) {
    const label = `${contractPath}: artifact example "${example?.format ?? '<missing>'}"`;
    if (typeof example?.format !== 'string' || example.format.trim().length === 0) {
      violations.push(`${label}: format must be a non-empty string`);
      continue;
    }
    if (typeof example.path !== 'string' || example.path.trim().length === 0) {
      violations.push(`${label}: path must be a non-empty string`);
      continue;
    }
    if (examplesByFormat.has(example.format)) {
      violations.push(`${contractPath}: duplicate artifact example format "${example.format}"`);
    }
    examplesByFormat.set(example.format, example.path);

    if (!existsSync(example.path)) {
      violations.push(`${label}: path must exist: ${example.path}`);
      continue;
    }
    if (!baselineArtifacts.has(example.path)) {
      violations.push(`${baselinePath}: trackedArtifacts must include artifact example ${example.path}`);
    }

    const source = readFileSync(example.path, 'utf8');
    if (!source.includes(example.format)) {
      violations.push(`${label}: example file must mention format "${example.format}"`);
    }
    if (!source.includes('"fixtureOnly": true') && !source.includes('"evidenceKind": "fixture_example"')) {
      violations.push(`${label}: example file must be marked as fixture-only`);
    }
  }

  const envArtifactFormats = new Set(
    contract.jobs
      .flatMap((job) => job.outputArtifacts ?? [])
      .filter((artifact) => artifact.env !== undefined)
      .map((artifact) => artifact.format),
  );

  for (const format of envArtifactFormats) {
    if (!examplesByFormat.has(format)) {
      violations.push(`${contractPath}: artifactExamples must include env artifact format "${format}"`);
    }
  }
  for (const format of examplesByFormat.keys()) {
    if (!envArtifactFormats.has(format)) {
      violations.push(`${contractPath}: artifactExamples contains unused format "${format}"`);
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
    'validateGeneratedArtifacts',
    'Refusing to validate generated external beta evidence artifacts',
    'post-run violations',
    'printJsonPlan',
    'printSummary',
    'printHandoff',
    'printJsonHandoff',
    'buildHandoff',
    'buildHandoffArtifactContracts',
    'buildHandoffInputs',
    'buildHandoffEnvArtifacts',
    'inputMetadataByEnv',
    'external-beta-evidence-input-matrix.json',
    'External Beta Evidence Handoff',
    'handoffAction',
    'formatHandoffArtifacts',
    'artifactExamplePathByFormat',
    'Artifact paths are printed by env name only',
    'contractClosurePercent',
    'externalEvidenceEnvReadinessPercent',
    'readinessCounts',
    'manualArtifactReadyForValidationJobCount',
    'blockedMissingRequiredEnvJobCount',
    'blockedInvalidInputJobCount',
    'uniqueMissingEnv',
    'readSelectedJobSelection',
    'Invalid external beta evidence job selection:',
    '--jobs requires at least one job id',
    'missingOptionalEnvCount',
    'uniqueMissingOptionalEnv',
    'jobExecutionReadiness',
    'blocked_missing_required_env',
    'blocked_invalid_env',
    'manualArtifactJobCount',
    'executableLiveJobCount',
    'validateArtifacts',
    'artifactValidationViolations',
    'Refusing to validate external beta evidence artifacts',
    'planPreflightViolations',
    'jobPreflightViolations',
    'preflightViolations',
    'Refusing external beta evidence preflight',
    'Blocked by invalid env/path',
    'preflightRequiresEnvValueValidation',
    'preflightRequiresEvidencePathValidation',
    'validatePlannedEvidencePathEnv',
    'before preflight',
    'validateExecutableOutputArtifactPathEnv',
    'liveExecutionValidatesOutputPathsBeforeRun',
    'before live execution',
    'validateEvidenceValueEnv',
    'criticalEnvValuesMustBeTyped',
    'immutable sha256 image digest',
    'valid https URL',
    'valid PostgreSQL URL',
    'valid RabbitMQ URL',
    'validateTypedUrlEnv',
    'validateHttpsEvidenceUrlEnv',
    'validateSecretTokenEnv',
    'validateSecretReferenceEnv',
    'postgresUrlEnvNames',
    'rabbitmqUrlEnvNames',
    'httpsEvidenceUrlEnvNames',
    'tokenEvidenceEnvNames',
    'secretReferenceEnvNames',
    'isPlaceholderSecretValue',
    'isRawSecretValueReference',
    'non-placeholder secret value',
    'non-placeholder secret reference',
    'postgresql:',
    'amqps:',
    'realEvidenceIdentityEnvNames',
    'isFixtureLikeEnvValue',
    'output artifact env',
    'readJsonArtifact',
    'valid JSON artifact',
    'artifactFormat',
    'must use format',
    'forbiddenEvidencePathFragments',
    'isFixtureLikeArtifactPath',
    'isFixtureLikePathSegment',
    'must not point to fixture or example evidence',
    'isGitTrackedPath',
    'ls-files',
    'git-tracked file',
    'schemaVersion 1',
    'validateEvidencePathEnv',
    'evidence path env',
    'absolute file path',
    'evidencePathEnvRequiresRegularFile',
    'isRegularEvidenceFile',
    'statSync',
    'must point to a regular file',
    'realpath must point to a regular file',
    'evidencePathEnvMaxBytes',
    'isOversizedEvidenceFile',
    'must not exceed',
    'Evidence path max size',
    'evidencePathEnvRequiresJsonExtension',
    'evidencePathEnvRequiresJsonContent',
    'evidencePathEnvForbidsWorkspacePath',
    'evidencePathEnvRequiresWritableParent',
    'evidencePathEnvForbidsDuplicatePaths',
    'requiresJsonEvidencePathEnv',
    'requiresJsonEvidencePathContent',
    'forbidsWorkspaceEvidencePaths',
    'isForbiddenWorkspaceEvidencePath',
    'inside the git workspace',
    'isValidEvidencePathParentDirectory',
    'isRegularDirectory',
    'parent directory must exist',
    'parent directory must be writable',
    'parent directory must not be inside the git workspace',
    'duplicateEvidencePathViolations',
    'duplicateEvidencePathViolationsByJob',
    'evidencePathDuplicateKey',
    'must not duplicate another evidence artifact path in this run',
    'outputArtifactPathEnvRequiresJsonExtension',
    'isJsonEvidencePath',
    'path must end with .json',
    'realpath must end with .json',
    'readEvidenceRealPath',
    'realpathSync',
    'realpath must not point to fixture or example evidence',
    'realpath must not point to a git-tracked file',
    'validateEvidencePathFileContent',
    'must be readable',
    'valid JSON evidence',
    'JSON object or array evidence file',
    'parseJsonEvidenceContent',
    'isStructuredJsonEvidence',
    'validateArtifactRedaction',
    'validateArtifactIdentity',
    'expectedArtifactId',
    'must use artifactId',
    'validateArtifactProviderKeys',
    'expectedProviderKeys',
    'must include providerKey',
    'must not include providerKey',
    'validateArtifactEnvConsistency',
    'validateArtifactFreshness',
    'artifactFreshness',
    'isIso8601Timestamp',
    'requiresIso8601Timestamp',
    'maxArtifactAgeHours',
    'maxArtifactFutureSkewMinutes',
    'observedArtifactTimestampValues',
    'release evidence timestamp',
    'older than',
    'must not be in the future',
    'artifactEnvConsistencyRules',
    'observedArtifactStringValues',
    'must match ${rule.envName}',
    'STAGING_ENVIRONMENT_ID',
    'BACKEND_IMAGE_DIGEST',
    'SOURCE_LIVE_ENVIRONMENT_ID',
    'SOURCE_LIVE_OPERATOR',
    'STAGING_SECRET_STORE_ID',
    'validateArtifactLiteralRedaction',
    'validateArtifactStructuredRedaction',
    'forbiddenArtifactValueFragments',
    'forbiddenArtifactValuePatterns',
    'sensitive literal pattern',
    'access_token',
    'x-api-key',
    'jwt credential',
    'forbiddenArtifactKeyPatterns',
    'isForbiddenArtifactKey',
    'access|refresh|id|jwt|session',
    'github_pat_',
    'glpat-',
    'xoxb-',
    'mongodb+srv://',
    'aws_secret_access_key',
    'sk-proj-',
    'forbiddenArtifactKeyNames',
    'apikey',
    'idtoken',
    'sessiontoken',
    'signingsecret',
    'sensitive literal fragment',
    'containsFixtureProvenance',
    'fixture provenance',
    'unredactedSensitiveKeyPaths',
    'unredacted sensitive key',
    'normalizeArtifactKey',
    'isRedactedArtifactValue',
    'not-redacted',
    'unredacted',
    'parseJsonEvidenceContent',
  ]) {
    if (!runnerSource.includes(marker)) {
      violations.push(`${contract.runnerFile}: runner must fail fast before executing unsafe job selections`);
    }
  }
}

function validateRunnerNegativeSmokes() {
  const wrongImageDigest = `sha256:${'c'.repeat(64)}`;
  const scenarios = [
    {
      label: 'fixture provenance',
      expectedOutput: 'fixture provenance',
      artifactPatch: {
        fixtureOnly: true,
        source: {
          evidenceKind: 'fixture_example',
        },
      },
    },
    {
      label: 'unredacted sensitive key',
      expectedOutput: 'unredacted sensitive key',
      artifactPatch: {
        diagnostics: {
          password: 'not-redacted-secret-value',
        },
      },
    },
    {
      label: 'wrong artifact id',
      expectedOutput: 'must use artifactId live-open-connectors-evidence-v1',
      artifactPatch: {
        artifactId: 'wrong-live-open-connectors-evidence',
      },
    },
    {
      label: 'missing provider key',
      expectedOutput: 'must include providerKey github',
      artifact: (base) => ({
        ...base,
        providerResults: base.providerResults.filter((result) => result.providerKey !== 'github'),
      }),
    },
    {
      label: 'unexpected provider key',
      expectedOutput: 'must not include providerKey mastodon',
      artifact: (base) => ({
        ...base,
        providerResults: [
          ...base.providerResults,
          {
            providerKey: 'mastodon',
            status: 'passed',
            sampledAt: base.sampledAt,
          },
        ],
      }),
    },
    {
      label: 'stale artifact timestamp',
      expectedOutput: 'older than',
      artifact: (base) => ({
        ...base,
        sampledAt: '2000-01-01T00:00:00.000Z',
        environment: {
          ...base.environment,
          sampledAt: '2000-01-01T00:00:00.000Z',
        },
        providerResults: base.providerResults.map((result) => ({
          ...result,
          sampledAt: '2000-01-01T00:00:00.000Z',
        })),
      }),
    },
    {
      label: 'future artifact timestamp',
      expectedOutput: 'must not be in the future',
      artifact: (base) => {
        const futureTimestamp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        return {
          ...base,
          sampledAt: futureTimestamp,
          environment: {
            ...base.environment,
            sampledAt: futureTimestamp,
          },
          providerResults: base.providerResults.map((result) => ({
            ...result,
            sampledAt: futureTimestamp,
          })),
        };
      },
    },
    {
      label: 'environment image digest mismatch',
      expectedOutput: 'imageDigest must match BACKEND_IMAGE_DIGEST',
      artifact: (base) => ({
        ...base,
        environment: {
          ...base.environment,
          imageDigest: wrongImageDigest,
        },
      }),
    },
  ];

  for (const scenario of scenarios) {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-negative-'));
    const artifactPath = join(tempDirectory, 'live-open-connectors.json');
    const baseArtifact = liveOpenConnectorsArtifact();
    const artifact = typeof scenario.artifact === 'function'
      ? scenario.artifact(baseArtifact)
      : {
        ...baseArtifact,
        ...scenario.artifactPatch,
      };
    try {
      writeFileSync(
        artifactPath,
        `${JSON.stringify(artifact, null, 2)}\n`,
        { mode: 0o600 },
      );

      const result = runRunnerNegativeSmoke(artifactPath);
      if (result.exitCode === 0) {
        violations.push(`${contract.runnerFile}: runner negative smoke must reject ${scenario.label}`);
        continue;
      }
      if (!result.output.includes(scenario.expectedOutput)) {
        violations.push(`${contract.runnerFile}: runner negative smoke for ${scenario.label} must report "${scenario.expectedOutput}"`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function validateRunnerPositiveArtifactSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-positive-'));
  const artifactPath = join(tempDirectory, 'live-open-connectors.json');
  try {
    writeFileSync(
      artifactPath,
      `${JSON.stringify(liveOpenConnectorsArtifact(), null, 2)}\n`,
      { mode: 0o600 },
    );

    const result = runRunnerArtifactSmoke(artifactPath);
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner positive artifact smoke must accept valid live-open-connectors evidence: ${smokeOutputSnippet(result.output)}`);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function validateRunnerPositiveDurableRuntimeArtifactSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-durable-positive-'));
  try {
    const artifactPath = writeDurableRuntimeSelectorArtifact(tempDirectory);
    const result = runRunnerDurableRuntimeArtifactSmoke(artifactPath);
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner positive durable runtime artifact smoke must accept a valid runtime selector artifact: ${smokeOutputSnippet(result.output)}`);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function validateRunnerNegativeDurableRuntimeArtifactSmokes() {
  const scenarios = [
    {
      label: 'durable runtime fixture provenance',
      expectedOutput: 'fixture provenance',
      mutateArtifact: (artifact) => {
        artifact.provenance = {
          evidenceKind: 'fixture_example',
          collectionMethod: 'Synthetic fixture example for durable runtime selector schema validation.',
          runner: 'ops/release/fixtures/durable-runtime-selector-artifact-examples.json',
          fixtureOnly: true,
        };
      },
    },
    {
      label: 'durable runtime in-memory selector',
      expectedOutput: 'must not be in-memory',
      mutateArtifact: (artifact) => {
        const service = artifact.services.find((item) => item.serviceId === 'api-gateway');
        service.serviceSelectors.MONITORING_PERSISTENCE = 'in-memory';
      },
    },
    {
      label: 'durable runtime missing event relay',
      expectedOutput: 'services must include event-relay',
      mutateArtifact: (artifact) => {
        artifact.services = artifact.services.filter((service) => service.serviceId !== 'event-relay');
      },
    },
    {
      label: 'durable runtime forbidden rollup',
      expectedOutput: 'rollup.forbiddenSelectorsFound must be false',
      mutateArtifact: (artifact) => {
        artifact.rollup.forbiddenSelectorsFound = true;
      },
    },
    {
      label: 'durable runtime image digest mismatch',
      expectedOutput: 'imageDigest must match BACKEND_IMAGE_DIGEST',
      mutateArtifact: (artifact) => {
        artifact.environment.imageDigest = `sha256:${'e'.repeat(64)}`;
      },
    },
  ];

  for (const scenario of scenarios) {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-durable-negative-'));
    try {
      const artifactPath = writeDurableRuntimeSelectorArtifact(tempDirectory, scenario);
      const result = runRunnerDurableRuntimeArtifactSmoke(artifactPath);
      if (result.exitCode === 0) {
        violations.push(`${contract.runnerFile}: runner negative durable runtime smoke must reject ${scenario.label}`);
        continue;
      }
      if (!result.output.includes(scenario.expectedOutput)) {
        violations.push(`${contract.runnerFile}: runner negative durable runtime smoke for ${scenario.label} must report "${scenario.expectedOutput}"`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function writeDurableRuntimeSelectorArtifact(tempDirectory, options = {}) {
  const artifactPath = join(tempDirectory, 'durable-runtime-selector.json');
  const artifact = durableRuntimeSelectorArtifact();
  options.mutateArtifact?.(artifact);
  writeFileSync(
    artifactPath,
    `${JSON.stringify(artifact, null, 2)}\n`,
    { mode: 0o600 },
  );
  return artifactPath;
}

function durableRuntimeSelectorArtifact() {
  const artifact = readJson('ops/release/fixtures/durable-runtime-selector-artifact-examples.json');
  const now = new Date().toISOString();
  const imageDigest = `sha256:${'d'.repeat(64)}`;
  artifact.provenance = {
    evidenceKind: 'staging_runtime_selector',
    collectionMethod: 'Runtime selector snapshot captured from beta staging deployment.',
    runner: 'scripts/capture-durable-runtime-selector.ts',
    fixtureOnly: false,
  };
  artifact.environment = {
    environmentId: 'staging-alpha-1',
    imageDigest,
    apiBaseUrl: 'https://api.staging.social-monitor.invalid',
    sampledAt: now,
    operator: 'release-operator-1',
  };
  artifact.services = artifact.services.map((service) => ({
    ...service,
    healthCheck: {
      ...service.healthCheck,
      checkedAt: now,
    },
  }));
  return artifact;
}

function validateRunnerPositiveStagingReliabilityArtifactSmokes() {
  for (const config of stagingReliabilitySmokeConfigs()) {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-staging-reliability-positive-'));
    try {
      const artifactPath = writeStagingReliabilityArtifact(tempDirectory, config);
      const result = runRunnerStagingReliabilityArtifactSmoke(config, artifactPath);
      if (result.exitCode !== 0) {
        violations.push(`${contract.runnerFile}: runner positive staging reliability smoke must accept valid ${config.artifactId} evidence: ${smokeOutputSnippet(result.output)}`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function validateRunnerNegativeStagingReliabilityArtifactSmokes() {
  const scenarios = [
    {
      label: 'staging reliability fixture provenance',
      artifactId: 'rabbitmq-staging-drill-output',
      expectedOutput: 'fixture provenance',
      mutateArtifact: (artifact) => {
        artifact.provenance = {
          evidenceKind: 'fixture_example',
          collectionMethod: 'Synthetic fixture example for RabbitMQ staging drill schema validation.',
          runner: 'ops/drills/fixtures/staging-reliability-artifact-examples.json',
          fixtureOnly: true,
        };
      },
    },
    {
      label: 'staging reliability wrong artifact id',
      artifactId: 'rabbitmq-staging-drill-output',
      expectedOutput: 'must use artifactId rabbitmq-staging-drill-output',
      mutateArtifact: (artifact) => {
        artifact.artifactId = 'wrong-staging-drill-output';
      },
    },
    {
      label: 'staging reliability image digest mismatch',
      artifactId: 'postgres-restore-drill-output',
      expectedOutput: 'imageDigest must match BACKEND_IMAGE_DIGEST',
      mutateArtifact: (artifact) => {
        artifact.imageDigest = `sha256:${'9'.repeat(64)}`;
      },
    },
    {
      label: 'staging reliability missing postgres signal',
      artifactId: 'postgres-restore-drill-output',
      expectedOutput: 'missing signal result "postgres-no-duplicate-side-effects"',
      mutateArtifact: (artifact) => {
        artifact.signalResults = artifact.signalResults.filter(
          (result) => result.signalId !== 'postgres-no-duplicate-side-effects',
        );
      },
    },
    {
      label: 'staging reliability failed durable signal',
      artifactId: 'durable-backend-e2e-output',
      expectedOutput: 'signal result "backend-loop-idempotency" must have status=passed',
      mutateArtifact: (artifact) => {
        const result = artifact.signalResults.find(
          (item) => item.signalId === 'backend-loop-idempotency',
        );
        result.status = 'failed';
      },
    },
    {
      label: 'staging reliability durable API mismatch',
      artifactId: 'durable-backend-e2e-output',
      expectedOutput: 'apiBaseUrl must match API_BASE_URL',
      mutateArtifact: (artifact) => {
        artifact.apiBaseUrl = 'https://api.other-staging.social-monitor.invalid';
      },
    },
  ];

  for (const scenario of scenarios) {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-staging-reliability-negative-'));
    try {
      const config = stagingReliabilitySmokeConfigByArtifactId(scenario.artifactId);
      const artifactPath = writeStagingReliabilityArtifact(tempDirectory, config, scenario);
      const result = runRunnerStagingReliabilityArtifactSmoke(config, artifactPath);
      if (result.exitCode === 0) {
        violations.push(`${contract.runnerFile}: runner negative staging reliability smoke must reject ${scenario.label}`);
        continue;
      }
      if (!result.output.includes(scenario.expectedOutput)) {
        violations.push(`${contract.runnerFile}: runner negative staging reliability smoke for ${scenario.label} must report "${scenario.expectedOutput}"`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function writeStagingReliabilityArtifact(tempDirectory, config, options = {}) {
  const artifactPath = join(tempDirectory, `${config.artifactId}.json`);
  const artifact = stagingReliabilityArtifact(config);
  options.mutateArtifact?.(artifact);
  writeFileSync(
    artifactPath,
    `${JSON.stringify(artifact, null, 2)}\n`,
    { mode: 0o600 },
  );
  return artifactPath;
}

function stagingReliabilityArtifact(config) {
  const fixture = readJson('ops/drills/fixtures/staging-reliability-artifact-examples.json');
  const example = fixture.examples.find((item) => item.artifactId === config.artifactId);
  if (example === undefined) {
    throw new Error(`Missing staging reliability fixture for ${config.artifactId}`);
  }

  const artifact = sanitizeStagingReliabilityArtifactStrings(JSON.parse(JSON.stringify(example)));
  const now = Date.now();
  const startedAtMs = now - 10 * 60 * 1000;
  const completedAtMs = now - 60 * 1000;
  const startedAt = new Date(startedAtMs).toISOString();
  const completedAt = new Date(completedAtMs).toISOString();

  artifact.environmentId = 'staging-alpha-1';
  artifact.imageDigest = config.imageDigest;
  artifact.operator = config.operator;
  artifact.startedAt = startedAt;
  artifact.completedAt = completedAt;
  artifact.provenance = {
    evidenceKind: 'staging_drill',
    collectionMethod: `${config.collectionLabel} captured from beta backend environment.`,
    runner: config.runner,
    fixtureOnly: false,
  };
  if (config.apiBaseUrl !== undefined) {
    artifact.apiBaseUrl = config.apiBaseUrl;
  } else {
    delete artifact.apiBaseUrl;
  }

  const signalStepMs = Math.floor((completedAtMs - startedAtMs) / (artifact.signalResults.length + 1));
  artifact.signalResults = artifact.signalResults.map((result, index) => {
    const observedAt = new Date(startedAtMs + signalStepMs * (index + 1)).toISOString();
    const refreshed = {
      ...result,
      observedAt,
    };
    refreshStagingReliabilityEvidenceTimestamps(refreshed.evidence, observedAt);
    return refreshed;
  });

  return artifact;
}

function sanitizeStagingReliabilityArtifactStrings(value) {
  if (typeof value === 'string') {
    return value
      .replaceAll('Synthetic', 'Captured')
      .replaceAll('synthetic', 'captured')
      .replaceAll('fixture', 'capture')
      .replaceAll('Fixture', 'Capture')
      .replaceAll('example', 'alpha')
      .replaceAll('Example', 'Alpha');
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeStagingReliabilityArtifactStrings(item));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeStagingReliabilityArtifactStrings(item)]),
    );
  }
  return value;
}

function refreshStagingReliabilityEvidenceTimestamps(value, observedAt) {
  if (Array.isArray(value)) {
    for (const item of value) {
      refreshStagingReliabilityEvidenceTimestamps(item, observedAt);
    }
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (key.endsWith('At') && typeof item === 'string') {
      value[key] = observedAt;
    } else {
      refreshStagingReliabilityEvidenceTimestamps(item, observedAt);
    }
  }
}

function stagingReliabilitySmokeConfigByArtifactId(artifactId) {
  const config = stagingReliabilitySmokeConfigs().find((item) => item.artifactId === artifactId);
  if (config === undefined) {
    throw new Error(`Missing staging reliability smoke config for ${artifactId}`);
  }
  return config;
}

function stagingReliabilitySmokeConfigs() {
  return [
    {
      artifactId: 'rabbitmq-staging-drill-output',
      collectionLabel: 'RabbitMQ reliability drill',
      envName: 'RABBITMQ_STAGING_DRILL_ARTIFACT_PATH',
      imageDigest: `sha256:${'1'.repeat(64)}`,
      jobId: 'rabbitmq-staging-reliability-drill',
      operator: 'ops-owner-1',
      runner: 'scripts/capture-rabbitmq-reliability-drill.ts',
      requiredEnv: {
        RABBITMQ_URL: 'amqps://release:...@rabbitmq.staging.social-monitor.invalid:5671',
      },
    },
    {
      artifactId: 'postgres-restore-drill-output',
      collectionLabel: 'Postgres restore and migration drill',
      envName: 'POSTGRES_RESTORE_DRILL_ARTIFACT_PATH',
      imageDigest: `sha256:${'2'.repeat(64)}`,
      jobId: 'postgres-restore-migration-drill',
      operator: 'ops-owner-1',
      runner: 'scripts/capture-postgres-restore-drill.ts',
      requiredEnv: {
        DATABASE_URL: 'postgresql://release:...@db.staging.social-monitor.invalid:5432/social_monitor',
      },
    },
    {
      apiBaseUrl: 'https://api.staging.social-monitor.invalid',
      artifactId: 'durable-backend-e2e-output',
      collectionLabel: 'Durable backend E2E loop',
      envName: 'DURABLE_BACKEND_E2E_ARTIFACT_PATH',
      imageDigest: `sha256:${'3'.repeat(64)}`,
      jobId: 'durable-backend-e2e-loop',
      operator: 'backend-lead-1',
      runner: 'scripts/capture-durable-backend-e2e-loop.ts',
      requiredEnv: {
        API_BASE_URL: 'https://api.staging.social-monitor.invalid',
      },
    },
  ];
}

function validateRunnerPositiveCredentialRotationArtifactSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-rotation-positive-'));
  try {
    const { sourceArtifactPath, webhookArtifactPath } = writeCredentialRotationArtifactPair(tempDirectory);
    const result = runRunnerCredentialRotationArtifactSmoke(sourceArtifactPath, webhookArtifactPath);
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner positive credential rotation artifact smoke must accept valid redacted rotation artifacts: ${smokeOutputSnippet(result.output)}`);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function validateRunnerNegativeCredentialRotationArtifactSmokes() {
  const scenarios = [
    {
      label: 'source rotation fixture provenance',
      expectedOutput: 'fixture provenance',
      mutateSource: (artifact) => {
        artifact.provenance = {
          evidenceKind: 'fixture_example',
          collectionMethod: 'Synthetic fixture example for source credential rotation schema validation.',
          runner: 'ops/security/fixtures/source-credential-rotation-redacted-examples.json',
          fixtureOnly: true,
        };
      },
    },
    {
      label: 'source rotation missing preview operation',
      expectedOutput: 'operations must include preview-redaction-proof',
      mutateSource: (artifact) => {
        artifact.operations = artifact.operations.filter(
          (operation) => operation.operationId !== 'preview-redaction-proof',
        );
      },
    },
    {
      label: 'webhook rotation plaintext redaction flag',
      expectedOutput: 'unredacted sensitive key',
      mutateWebhook: (artifact) => {
        artifact.redaction.plaintextCredentialValuesIncluded = true;
      },
    },
    {
      label: 'webhook rotation unchanged old key',
      expectedOutput: 'old-key-rejected-after-rotation must change key id',
      mutateWebhook: (artifact) => {
        const operation = artifact.operations.find(
          (item) => item.operationId === 'old-key-rejected-after-rotation',
        );
        operation.keyIdAfter = operation.keyIdBefore;
      },
    },
    {
      label: 'source rotation secret store mismatch',
      expectedOutput: 'secretStoreId must match STAGING_SECRET_STORE_ID',
      mutateSource: (artifact) => {
        artifact.environment.secretStoreId = 'secret-store-staging-other-1';
      },
    },
  ];

  for (const scenario of scenarios) {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-rotation-negative-'));
    try {
      const { sourceArtifactPath, webhookArtifactPath } = writeCredentialRotationArtifactPair(
        tempDirectory,
        scenario,
      );
      const result = runRunnerCredentialRotationArtifactSmoke(sourceArtifactPath, webhookArtifactPath);
      if (result.exitCode === 0) {
        violations.push(`${contract.runnerFile}: runner negative credential rotation smoke must reject ${scenario.label}`);
        continue;
      }
      if (!result.output.includes(scenario.expectedOutput)) {
        violations.push(`${contract.runnerFile}: runner negative credential rotation smoke for ${scenario.label} must report "${scenario.expectedOutput}"`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function writeCredentialRotationArtifactPair(tempDirectory, options = {}) {
  const sourceArtifactPath = join(tempDirectory, 'source-credential-rotation.json');
  const webhookArtifactPath = join(tempDirectory, 'webhook-secret-rotation.json');
  const sourceArtifact = sourceCredentialRotationArtifact();
  const webhookArtifact = webhookSecretRotationArtifact();
  options.mutateSource?.(sourceArtifact);
  options.mutateWebhook?.(webhookArtifact);
  writeFileSync(
    sourceArtifactPath,
    `${JSON.stringify(sourceArtifact, null, 2)}\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    webhookArtifactPath,
    `${JSON.stringify(webhookArtifact, null, 2)}\n`,
    { mode: 0o600 },
  );
  return { sourceArtifactPath, webhookArtifactPath };
}

function sourceCredentialRotationArtifact() {
  const artifact = readJson('ops/security/fixtures/source-credential-rotation-redacted-examples.json');
  applyCredentialRotationRealEvidence(artifact, {
    evidenceKind: 'staging_source_credential_rotation',
    collectionMethod: 'Rotation drill captured from staging source credential boundary.',
    runner: 'scripts/capture-source-credential-rotation.ts',
  });
  return artifact;
}

function webhookSecretRotationArtifact() {
  const artifact = readJson('ops/security/fixtures/webhook-secret-rotation-redacted-examples.json');
  applyCredentialRotationRealEvidence(artifact, {
    evidenceKind: 'staging_webhook_secret_rotation',
    collectionMethod: 'Rotation drill captured from staging webhook secret boundary.',
    runner: 'scripts/capture-webhook-secret-rotation.ts',
  });
  return artifact;
}

function applyCredentialRotationRealEvidence(artifact, provenance) {
  const now = new Date().toISOString();
  artifact.provenance = {
    ...provenance,
    fixtureOnly: false,
  };
  artifact.environment = {
    environmentId: 'staging-secret-rotation-alpha-1',
    secretStoreId: 'secret-store-staging-alpha-1',
    sampledAt: now,
    operator: 'security-owner-1',
  };
  artifact.operations = artifact.operations.map((operation) => ({
    ...operation,
    observedAt: now,
  }));
}

function validateRunnerPositiveSecurityFinalSweepArtifactSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-security-positive-'));
  try {
    const { artifactPath, exportPaths } = writeSecurityFinalSweepArtifact(tempDirectory);
    const result = runRunnerSecurityFinalSweepArtifactSmoke(artifactPath, exportPaths);
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner positive security final sweep artifact smoke must accept valid redacted export evidence: ${smokeOutputSnippet(result.output)}`);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function validateRunnerNegativeSecurityFinalSweepArtifactSmokes() {
  const scenarios = [
    {
      label: 'security sweep fixture provenance',
      expectedOutput: 'fixture provenance',
      mutateArtifact: (artifact) => {
        artifact.provenance = {
          evidenceKind: 'fixture_example',
          collectionMethod: 'Synthetic fixture example for security final sweep schema validation.',
          runner: 'ops/security/fixtures/security-final-sweep-staging-artifact-examples.json',
          fixtureOnly: true,
        };
      },
    },
    {
      label: 'security sweep missing public error export',
      expectedOutput: 'sourceExports must include public-errors',
      mutateArtifact: (artifact) => {
        artifact.sourceExports = artifact.sourceExports.filter(
          (sourceExport) => sourceExport.surfaceId !== 'public-errors',
        );
      },
    },
    {
      label: 'security sweep mismatched export digest',
      expectedOutput: 'sha256 must match the export file content',
      mutateArtifact: (artifact) => {
        const logExport = artifact.sourceExports.find((sourceExport) => sourceExport.surfaceId === 'logs');
        logExport.sha256 = '0'.repeat(64);
      },
    },
    {
      label: 'security sweep unsafe diagnostic field',
      expectedOutput: 'unsafe diagnostic field',
      mutateArtifact: (artifact) => {
        const logsSurface = artifact.surfaces.find((surface) => surface.surfaceId === 'logs');
        logsSurface.safeDiagnosticFields.push(['to', 'ken'].join(''));
      },
    },
    {
      label: 'security sweep export sensitive literal',
      expectedOutput: 'LOG_EXPORT_PATH must not contain sensitive literal fragment',
      mutateExports: (exportsBySurface) => {
        exportsBySurface.logs.records.push({
          requestId: 'req-leak-1',
          message: ['bearer', ' leaked-value'].join(''),
        });
      },
    },
    {
      label: 'security sweep raw source redaction flag',
      expectedOutput: 'redaction.rawSourceTextIncluded must be false',
      mutateArtifact: (artifact) => {
        artifact.redaction.rawSourceTextIncluded = true;
      },
    },
  ];

  for (const scenario of scenarios) {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-security-negative-'));
    try {
      const { artifactPath, exportPaths } = writeSecurityFinalSweepArtifact(
        tempDirectory,
        scenario,
      );
      const result = runRunnerSecurityFinalSweepArtifactSmoke(artifactPath, exportPaths);
      if (result.exitCode === 0) {
        violations.push(`${contract.runnerFile}: runner negative security final sweep smoke must reject ${scenario.label}`);
        continue;
      }
      if (!result.output.includes(scenario.expectedOutput)) {
        violations.push(`${contract.runnerFile}: runner negative security final sweep smoke for ${scenario.label} must report "${scenario.expectedOutput}"`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function writeSecurityFinalSweepArtifact(tempDirectory, options = {}) {
  const exportDocuments = securityFinalSweepExportDocuments();
  options.mutateExports?.(exportDocuments);
  const exportPaths = writeSecurityFinalSweepExports(tempDirectory, exportDocuments);
  const artifactPath = join(tempDirectory, 'security-final-sweep.json');
  const artifact = securityFinalSweepArtifact(exportPaths);
  options.mutateArtifact?.(artifact, exportPaths);
  writeFileSync(
    artifactPath,
    `${JSON.stringify(artifact, null, 2)}\n`,
    { mode: 0o600 },
  );
  return { artifactPath, exportPaths };
}

function securityFinalSweepExportDocuments() {
  return {
    logs: {
      records: [
        {
          requestId: 'req-sec-1',
          tenantId: 'tenant-alpha-1',
          workspaceId: 'workspace-alpha-1',
          service: 'api-gateway',
          operation: 'create-topic',
          status: 'ok',
        },
        {
          requestId: 'req-sec-2',
          tenantId: 'tenant-alpha-1',
          workspaceId: 'workspace-alpha-1',
          service: 'ingestion-worker',
          operation: 'scan-complete',
          status: 'ok',
        },
      ],
    },
    metrics: {
      records: [
        {
          metricName: 'queue_lag_seconds',
          tenantId: 'tenant-alpha-1',
          workspaceId: 'workspace-alpha-1',
          service: 'delivery-service',
          status: 'ok',
        },
        {
          metricName: 'summary_cost_units',
          tenantId: 'tenant-alpha-1',
          workspaceId: 'workspace-alpha-1',
          service: 'intelligence-worker',
          status: 'ok',
        },
      ],
    },
    publicErrors: {
      records: [
        {
          requestId: 'req-sec-3',
          statusCode: 401,
          errorCode: 'workspace_access_denied',
          operation: 'list-feed',
        },
        {
          requestId: 'req-sec-4',
          statusCode: 429,
          errorCode: 'rate_limit_exceeded',
          operation: 'create-scan',
        },
      ],
    },
  };
}

function writeSecurityFinalSweepExports(tempDirectory, exportDocuments) {
  return {
    logs: writeSecurityFinalSweepExport(tempDirectory, 'logs-export.json', exportDocuments.logs),
    metrics: writeSecurityFinalSweepExport(tempDirectory, 'metrics-export.json', exportDocuments.metrics),
    publicErrors: writeSecurityFinalSweepExport(
      tempDirectory,
      'public-errors-export.json',
      exportDocuments.publicErrors,
    ),
  };
}

function writeSecurityFinalSweepExport(tempDirectory, filename, document) {
  const path = join(tempDirectory, filename);
  const content = `${JSON.stringify(document, null, 2)}\n`;
  writeFileSync(path, content, { mode: 0o600 });
  return {
    path,
    sha256: createHash('sha256').update(content).digest('hex'),
    sampleCount: document.records.length,
  };
}

function securityFinalSweepArtifact(exportPaths) {
  const artifact = readJson('ops/security/fixtures/security-final-sweep-staging-artifact-examples.json');
  const now = new Date().toISOString();
  artifact.provenance = {
    evidenceKind: 'staging_security_final_sweep',
    collectionMethod: 'Deploy log metric and public error samples captured from staging backend release.',
    runner: 'scripts/capture-security-final-sweep.ts',
    fixtureOnly: false,
  };
  artifact.environment = {
    environmentId: 'staging-security-alpha-1',
    imageDigest: `sha256:${'f'.repeat(64)}`,
    sampledAt: now,
    operator: 'security-owner-1',
  };
  artifact.sourceExports = [
    securityFinalSweepSourceExport('logs', 'LOG_EXPORT_PATH', exportPaths.logs, now),
    securityFinalSweepSourceExport('metrics', 'METRICS_EXPORT_PATH', exportPaths.metrics, now),
    securityFinalSweepSourceExport(
      'public-errors',
      'PUBLIC_ERROR_EXPORT_PATH',
      exportPaths.publicErrors,
      now,
    ),
  ];
  updateSecurityFinalSweepSurface(artifact, 'logs', exportPaths.logs.sampleCount);
  updateSecurityFinalSweepSurface(artifact, 'metrics', exportPaths.metrics.sampleCount);
  updateSecurityFinalSweepSurface(artifact, 'public-errors', exportPaths.publicErrors.sampleCount);
  updateSecurityFinalSweepSurface(artifact, 'audit-metadata', 2);
  artifact.review = {
    reviewer: 'security-owner-1',
    decision: 'passed',
    notes: 'Staging redaction review completed for logs, metrics, public errors and audit metadata.',
  };
  return artifact;
}

function securityFinalSweepSourceExport(surfaceId, envVar, exportFile, collectedAt) {
  return {
    surfaceId,
    envVar,
    path: exportFile.path,
    sha256: exportFile.sha256,
    sampleCount: exportFile.sampleCount,
    redactedOnly: true,
    sanitized: true,
    collectedAt,
  };
}

function updateSecurityFinalSweepSurface(artifact, surfaceId, sampleCount) {
  const surface = artifact.surfaces.find((item) => item.surfaceId === surfaceId);
  surface.sampleCount = sampleCount;
  for (const result of surface.leakClassResults) {
    result.sampleCount = sampleCount;
  }
}

function validateRunnerPositiveRedditArtifactSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-reddit-positive-'));
  try {
    const { liveArtifactPath, lifecyclePath } = writeRedditArtifactPair(tempDirectory);
    const result = runRunnerRedditArtifactSmoke(liveArtifactPath, lifecyclePath);
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner positive Reddit artifact smoke must accept valid live Reddit evidence and lifecycle pair: ${smokeOutputSnippet(result.output)}`);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function validateRunnerNegativeRedditArtifactSmokes() {
  const scenarios = [
    {
      label: 'reddit lifecycle hash mismatch',
      expectedOutput: 'sha256 must match reddit live evidence lifecycle signal',
      lifecycleArtifactSha256: '0'.repeat(64),
    },
    {
      label: 'reddit lifecycle unredacted sensitive key',
      expectedOutput: 'unredacted sensitive key',
      mutateLifecycle: (artifact) => {
        artifact.diagnostics = {
          password: 'not-redacted-secret-value',
        };
      },
    },
    {
      label: 'reddit lifecycle missing redacted preview',
      expectedOutput: 'lifecycleOperations must include redacted-preview',
      mutateLifecycle: (artifact) => {
        artifact.lifecycleOperations = artifact.lifecycleOperations.filter(
          (operation) => operation.operation !== 'redacted-preview',
        );
      },
    },
    {
      label: 'reddit live evidence missing provider',
      expectedOutput: 'must include providerKey reddit',
      mutateLive: (artifact) => {
        artifact.providerResults = [];
      },
    },
  ];

  for (const scenario of scenarios) {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-reddit-negative-'));
    try {
      const { liveArtifactPath, lifecyclePath } = writeRedditArtifactPair(
        tempDirectory,
        scenario,
      );
      const result = runRunnerRedditArtifactSmoke(liveArtifactPath, lifecyclePath);
      if (result.exitCode === 0) {
        violations.push(`${contract.runnerFile}: runner negative Reddit smoke must reject ${scenario.label}`);
        continue;
      }
      if (!result.output.includes(scenario.expectedOutput)) {
        violations.push(`${contract.runnerFile}: runner negative Reddit smoke for ${scenario.label} must report "${scenario.expectedOutput}"`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function writeRedditArtifactPair(tempDirectory, options = {}) {
  const lifecyclePath = join(tempDirectory, 'reddit-credential-lifecycle.json');
  const liveArtifactPath = join(tempDirectory, 'reddit-live-evidence.json');
  const lifecycleArtifact = redditCredentialLifecycleArtifact();
  options.mutateLifecycle?.(lifecycleArtifact);
  const lifecycleContent = `${JSON.stringify(lifecycleArtifact, null, 2)}\n`;
  const lifecycleSha256 = createHash('sha256').update(lifecycleContent).digest('hex');
  const liveArtifact = liveRedditArtifact(options.lifecycleArtifactSha256 ?? lifecycleSha256);
  options.mutateLive?.(liveArtifact, lifecycleSha256);
  writeFileSync(lifecyclePath, lifecycleContent, { mode: 0o600 });
  writeFileSync(
    liveArtifactPath,
    `${JSON.stringify(liveArtifact, null, 2)}\n`,
    { mode: 0o600 },
  );
  return { liveArtifactPath, lifecyclePath, lifecycleSha256 };
}

function runRunnerNegativeSmoke(artifactPath) {
  return runRunnerArtifactSmoke(artifactPath);
}

function runRunnerSecurityFinalSweepArtifactSmoke(artifactPath, exportPaths) {
  try {
    execFileSync(
      process.execPath,
      [
        contract.runnerFile,
        '--validate-artifacts',
        '--require-env',
        '--job',
        'security-final-sweep-staging',
      ],
      {
        env: {
          PATH: process.env.PATH ?? '',
          LOG_EXPORT_PATH: exportPaths.logs.path,
          METRICS_EXPORT_PATH: exportPaths.metrics.path,
          PUBLIC_ERROR_EXPORT_PATH: exportPaths.publicErrors.path,
          SECURITY_FINAL_SWEEP_ARTIFACT_PATH: artifactPath,
        },
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
    return { exitCode: 0, output: '' };
  } catch (error) {
    return {
      exitCode: typeof error.status === 'number' ? error.status : 1,
      output: `${error.stdout ?? ''}\n${error.stderr ?? ''}`,
    };
  }
}

function runRunnerCredentialRotationArtifactSmoke(sourceArtifactPath, webhookArtifactPath) {
  try {
    execFileSync(
      process.execPath,
      [
        contract.runnerFile,
        '--validate-artifacts',
        '--require-env',
        '--job',
        'credential-secret-rotation-drill',
      ],
      {
        env: {
          PATH: process.env.PATH ?? '',
          SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH: sourceArtifactPath,
          STAGING_SECRET_STORE_ID: 'secret-store-staging-alpha-1',
          WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH: webhookArtifactPath,
        },
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
    return { exitCode: 0, output: '' };
  } catch (error) {
    return {
      exitCode: typeof error.status === 'number' ? error.status : 1,
      output: `${error.stdout ?? ''}\n${error.stderr ?? ''}`,
    };
  }
}

function runRunnerDurableRuntimeArtifactSmoke(artifactPath) {
  const imageDigest = `sha256:${'d'.repeat(64)}`;
  try {
    execFileSync(
      process.execPath,
      [
        contract.runnerFile,
        '--validate-artifacts',
        '--require-env',
        '--job',
        'durable-runtime-staging-proof',
      ],
      {
        env: {
          PATH: process.env.PATH ?? '',
          API_BASE_URL: 'https://api.staging.social-monitor.invalid',
          BACKEND_IMAGE_DIGEST: imageDigest,
          DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH: artifactPath,
          STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
        },
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
    return { exitCode: 0, output: '' };
  } catch (error) {
    return {
      exitCode: typeof error.status === 'number' ? error.status : 1,
      output: `${error.stdout ?? ''}\n${error.stderr ?? ''}`,
    };
  }
}

function runRunnerStagingReliabilityArtifactSmoke(config, artifactPath) {
  try {
    execFileSync(
      process.execPath,
      [
        contract.runnerFile,
        '--validate-artifacts',
        '--require-env',
        '--job',
        config.jobId,
      ],
      {
        env: {
          PATH: process.env.PATH ?? '',
          BACKEND_IMAGE_DIGEST: config.imageDigest,
          STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
          [config.envName]: artifactPath,
          ...config.requiredEnv,
        },
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
    return { exitCode: 0, output: '' };
  } catch (error) {
    return {
      exitCode: typeof error.status === 'number' ? error.status : 1,
      output: `${error.stdout ?? ''}\n${error.stderr ?? ''}`,
    };
  }
}

function runRunnerArtifactSmoke(artifactPath) {
  const imageDigest = `sha256:${'a'.repeat(64)}`;
  try {
    execFileSync(
      process.execPath,
      [
        contract.runnerFile,
        '--validate-artifacts',
        '--require-env',
        '--job',
        'live-open-connectors',
      ],
      {
        env: {
          PATH: process.env.PATH ?? '',
          BACKEND_IMAGE_DIGEST: imageDigest,
          LIVE_OPEN_CONNECTORS_EVIDENCE_PATH: artifactPath,
          SOURCE_LIVE_ENVIRONMENT_ID: 'source-prod-alpha',
          SOURCE_LIVE_OPERATOR: 'release-operator-1',
        },
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
    return { exitCode: 0, output: '' };
  } catch (error) {
    return {
      exitCode: typeof error.status === 'number' ? error.status : 1,
      output: `${error.stdout ?? ''}\n${error.stderr ?? ''}`,
    };
  }
}

function runRunnerRedditArtifactSmoke(liveArtifactPath, lifecyclePath) {
  const imageDigest = `sha256:${'b'.repeat(64)}`;
  try {
    execFileSync(
      process.execPath,
      [
        contract.runnerFile,
        '--validate-artifacts',
        '--require-env',
        '--job',
        'live-reddit-oauth',
      ],
      {
        env: {
          PATH: process.env.PATH ?? '',
          BACKEND_IMAGE_DIGEST: imageDigest,
          REDDIT_ACCESS_TOKEN: 'reddit-live-value-1234567890',
          REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: lifecyclePath,
          REDDIT_LIVE_EVIDENCE_PATH: liveArtifactPath,
          SOURCE_LIVE_ENVIRONMENT_ID: 'source-reddit-alpha',
          SOURCE_LIVE_OPERATOR: 'source-operator-1',
        },
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
    return { exitCode: 0, output: '' };
  } catch (error) {
    return {
      exitCode: typeof error.status === 'number' ? error.status : 1,
      output: `${error.stdout ?? ''}\n${error.stderr ?? ''}`,
    };
  }
}

function validateRunnerPreflightNegativeSmokes() {
  const scenarios = [
    {
      label: 'raw OIDC_TEST_TOKEN_REF secret value',
      jobId: 'durable-backend-e2e-loop',
      expectedOutput: ['OIDC_TEST_TOKEN_REF', 'non-placeholder secret reference'],
      env: (tempDirectory) => durableBackendE2ePreflightEnv(tempDirectory, {
        OIDC_TEST_TOKEN_REF: 'bearer raw-secret-reference-should-fail',
      }),
    },
    {
      label: 'mutable backend image digest',
      jobId: 'durable-backend-e2e-loop',
      expectedOutput: ['BACKEND_IMAGE_DIGEST', 'immutable sha256 image digest'],
      env: (tempDirectory) => durableBackendE2ePreflightEnv(tempDirectory, {
        BACKEND_IMAGE_DIGEST: 'sha256:not-a-real-digest',
      }),
    },
    {
      label: 'local API base URL',
      jobId: 'durable-backend-e2e-loop',
      expectedOutput: ['API_BASE_URL', 'must not use local'],
      env: (tempDirectory) => durableBackendE2ePreflightEnv(tempDirectory, {
        API_BASE_URL: 'https://localhost/internal',
      }),
    },
    {
      label: 'workspace evidence artifact path',
      jobId: 'durable-backend-e2e-loop',
      expectedOutput: ['DURABLE_BACKEND_E2E_ARTIFACT_PATH', 'inside the git workspace'],
      env: (tempDirectory) => durableBackendE2ePreflightEnv(tempDirectory, {
        DURABLE_BACKEND_E2E_ARTIFACT_PATH: join(process.cwd(), 'durable-backend-e2e.json'),
      }),
    },
    {
      label: 'invalid Postgres URL',
      jobId: 'postgres-restore-migration-drill',
      expectedOutput: ['DATABASE_URL', 'valid PostgreSQL URL'],
      env: (tempDirectory) => postgresRestorePreflightEnv(tempDirectory, {
        DATABASE_URL: 'https://db.staging.social-monitor.invalid',
      }),
    },
    {
      label: 'invalid RabbitMQ URL',
      jobId: 'rabbitmq-staging-reliability-drill',
      expectedOutput: ['RABBITMQ_URL', 'valid RabbitMQ URL'],
      env: (tempDirectory) => rabbitmqDrillPreflightEnv(tempDirectory, {
        RABBITMQ_URL: 'https://rabbitmq.staging.social-monitor.invalid',
      }),
    },
    {
      label: 'placeholder Reddit access token',
      jobId: 'live-reddit-oauth',
      expectedOutput: ['REDDIT_ACCESS_TOKEN', 'non-placeholder secret value'],
      env: (tempDirectory) => redditOAuthPreflightEnv(tempDirectory, {
        REDDIT_ACCESS_TOKEN: 'placeholder',
      }),
    },
  ];

  for (const scenario of scenarios) {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-preflight-negative-'));
    try {
      const result = runRunnerPreflightNegativeSmoke(scenario.jobId, scenario.env(tempDirectory));
      if (result.exitCode === 0) {
        violations.push(`${contract.runnerFile}: runner preflight negative smoke must reject ${scenario.label}`);
        continue;
      }
      for (const expectedOutput of scenario.expectedOutput) {
        if (!result.output.includes(expectedOutput)) {
          violations.push(`${contract.runnerFile}: runner preflight negative smoke for ${scenario.label} must report "${expectedOutput}"`);
        }
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function runRunnerPreflightNegativeSmoke(jobId, env) {
  try {
    execFileSync(
      process.execPath,
      [
        contract.runnerFile,
        '--require-env',
        '--job',
        jobId,
      ],
      {
        env: {
          PATH: process.env.PATH ?? '',
          ...env,
        },
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
    return { exitCode: 0, output: '' };
  } catch (error) {
    return {
      exitCode: typeof error.status === 'number' ? error.status : 1,
      output: `${error.stdout ?? ''}\n${error.stderr ?? ''}`,
    };
  }
}

function durableBackendE2ePreflightEnv(tempDirectory, overrides = {}) {
  return {
    API_BASE_URL: 'https://api.staging.social-monitor.invalid',
    BACKEND_IMAGE_DIGEST: `sha256:${'b'.repeat(64)}`,
    DURABLE_BACKEND_E2E_ARTIFACT_PATH: join(tempDirectory, 'durable-backend-e2e.json'),
    STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
    ...overrides,
  };
}

function postgresRestorePreflightEnv(tempDirectory, overrides = {}) {
  return {
    BACKEND_IMAGE_DIGEST: `sha256:${'c'.repeat(64)}`,
    DATABASE_URL: 'postgresql://release:...@db.staging.social-monitor.invalid:5432/social_monitor',
    POSTGRES_RESTORE_DRILL_ARTIFACT_PATH: join(tempDirectory, 'postgres-restore-drill.json'),
    STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
    ...overrides,
  };
}

function rabbitmqDrillPreflightEnv(tempDirectory, overrides = {}) {
  return {
    BACKEND_IMAGE_DIGEST: `sha256:${'d'.repeat(64)}`,
    RABBITMQ_STAGING_DRILL_ARTIFACT_PATH: join(tempDirectory, 'rabbitmq-staging-drill.json'),
    RABBITMQ_URL: 'amqps://release:...@rabbitmq.staging.social-monitor.invalid:5671',
    STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
    ...overrides,
  };
}

function redditOAuthPreflightEnv(tempDirectory, overrides = {}) {
  return {
    BACKEND_IMAGE_DIGEST: `sha256:${'e'.repeat(64)}`,
    REDDIT_ACCESS_TOKEN: 'reddit-live-access-value-1234567890',
    REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: join(tempDirectory, 'reddit-credential-lifecycle.json'),
    REDDIT_LIVE_EVIDENCE_PATH: join(tempDirectory, 'reddit-live-evidence.json'),
    SOURCE_LIVE_ENVIRONMENT_ID: 'source-live-alpha-1',
    SOURCE_LIVE_OPERATOR: 'source-operator-1',
    ...overrides,
  };
}

function validateRunnerPreflightPositiveSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-preflight-positive-'));
  try {
    const result = runRunnerPreflightPositiveSmoke(completeExternalEvidencePreflightEnv(tempDirectory));
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner positive preflight smoke must accept structurally valid required env: ${smokeOutputSnippet(result.output)}`);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function runRunnerPreflightPositiveSmoke(env) {
  try {
    execFileSync(
      process.execPath,
      [
        contract.runnerFile,
        '--require-env',
      ],
      {
        env: {
          PATH: process.env.PATH ?? '',
          ...env,
        },
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
    return { exitCode: 0, output: '' };
  } catch (error) {
    return {
      exitCode: typeof error.status === 'number' ? error.status : 1,
      output: `${error.stdout ?? ''}\n${error.stderr ?? ''}`,
    };
  }
}

function completeExternalEvidencePreflightEnv(tempDirectory) {
  return {
    API_BASE_URL: 'https://api.staging.social-monitor.invalid',
    BACKEND_IMAGE_DIGEST: `sha256:${'f'.repeat(64)}`,
    DATABASE_URL: 'postgresql://release:...@db.staging.social-monitor.invalid:5432/social_monitor',
    DURABLE_BACKEND_E2E_ARTIFACT_PATH: join(tempDirectory, 'durable-backend-e2e.json'),
    DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH: join(tempDirectory, 'durable-runtime-selector.json'),
    LIVE_OPEN_CONNECTORS_EVIDENCE_PATH: join(tempDirectory, 'live-open-connectors.json'),
    LOG_EXPORT_PATH: join(tempDirectory, 'security-log-export.json'),
    METRICS_EXPORT_PATH: join(tempDirectory, 'security-metrics-export.json'),
    POSTGRES_RESTORE_DRILL_ARTIFACT_PATH: join(tempDirectory, 'postgres-restore-drill.json'),
    PUBLIC_ERROR_EXPORT_PATH: join(tempDirectory, 'security-public-error-export.json'),
    RABBITMQ_STAGING_DRILL_ARTIFACT_PATH: join(tempDirectory, 'rabbitmq-staging-drill.json'),
    RABBITMQ_URL: 'amqps://release:...@rabbitmq.staging.social-monitor.invalid:5671',
    REDDIT_ACCESS_TOKEN: 'reddit-live-access-value-1234567890',
    REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: join(tempDirectory, 'reddit-credential-lifecycle.json'),
    REDDIT_LIVE_EVIDENCE_PATH: join(tempDirectory, 'reddit-live-evidence.json'),
    RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH: join(tempDirectory, 'release-deploy-smoke.json'),
    SECURITY_FINAL_SWEEP_ARTIFACT_PATH: join(tempDirectory, 'security-final-sweep.json'),
    SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH: join(tempDirectory, 'source-credential-rotation.json'),
    SOURCE_LIVE_ENVIRONMENT_ID: 'source-live-alpha-1',
    SOURCE_LIVE_OPERATOR: 'source-operator-1',
    STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
    STAGING_SECRET_STORE_ID: 'secret-store-staging-alpha-1',
    SUMMARY_REAL_FEEDBACK_SAMPLES_PATH: join(tempDirectory, 'summary-real-feedback-samples.json'),
    WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH: join(tempDirectory, 'webhook-secret-rotation.json'),
  };
}

function smokeOutputSnippet(output) {
  return String(output)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(-8)
    .join(' | ');
}

function liveOpenConnectorsArtifact() {
  const now = new Date().toISOString();
  const imageDigest = `sha256:${'a'.repeat(64)}`;
  return {
    schemaVersion: 1,
    format: 'source-live-provider-evidence-v1',
    artifactId: 'live-open-connectors-evidence-v1',
    environmentId: 'source-prod-alpha',
    imageDigest,
    operator: 'release-operator-1',
    sampledAt: now,
    provenance: {
      evidenceKind: 'live_network',
      collectionMethod: 'live provider smoke captured on staging beta environment',
      runner: 'scripts/check-live-open-connectors.ts',
      fixtureOnly: false,
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadsIncluded: false,
      credentialValuesIncluded: false,
      privateNetworkUrlsIncluded: false,
    },
    environment: {
      environmentId: 'source-prod-alpha',
      imageDigest,
      operator: 'release-operator-1',
      sampledAt: now,
    },
    providerResults: [
      {
        providerKey: 'hacker-news',
        status: 'passed',
        signalResults: [
          {
            signalId: 'hn-live-http-smoke',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'Redacted live Hacker News listing and search returned normalized numeric ids.',
              listingStoryCount: 2,
              searchStoryCount: 2,
              stableNumericIds: true,
              normalizedIdsSampled: true,
            },
          },
          {
            signalId: 'hn-rate-limit-evidence',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'Request budget and provider rate limited degradation signal were recorded.',
              timeoutMs: 10000,
              maxListingStories: 2,
              maxSearchStories: 2,
              degradationSignalRecorded: true,
            },
          },
        ],
      },
      {
        providerKey: 'rss',
        status: 'passed',
        signalResults: [
          {
            signalId: 'rss-allowlisted-live-feeds',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'Redacted allowlisted RSS feeds returned normalized readable items.',
              feedCount: 2,
              itemCount: 4,
              allowlistMatched: true,
              normalizedItemsObserved: true,
            },
          },
          {
            signalId: 'rss-http-cache-evidence',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'HTTP cache validators were observed on repeated RSS reads.',
              cacheValidatorFeedCount: 1,
              validatorsObserved: ['etag', 'last-modified'],
              conditionalReadObserved: true,
            },
          },
          {
            signalId: 'rss-ssrf-proof',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'Private and loopback targets were rejected before fetch.',
              rejectedProbeCount: 4,
              blockedTargetClasses: ['loopback', 'localhost', 'metadata-service', 'file'],
              rejectedBeforeFetch: true,
            },
          },
        ],
      },
      {
        providerKey: 'github',
        status: 'passed',
        signalResults: [
          {
            signalId: 'github-live-api-smoke',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'Redacted live GitHub API search returned normalized issue items.',
              issueCount: 1,
              canonicalUrlsObserved: true,
              pullRequestsExcluded: true,
              authMode: 'anonymous',
            },
          },
          {
            signalId: 'github-rate-limit-budget',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'GitHub core and search rate limit budget were recorded without credential values.',
              coreRemaining: 100,
              searchRemaining: 10,
              budgetObserved: true,
            },
          },
        ],
      },
    ],
  };
}

function redditCredentialLifecycleArtifact() {
  const now = new Date().toISOString();
  const imageDigest = `sha256:${'b'.repeat(64)}`;
  return {
    schemaVersion: 1,
    format: 'reddit-credential-lifecycle-redacted-v1',
    artifactId: 'reddit-credential-lifecycle-redacted-positive-smoke',
    environmentId: 'source-reddit-alpha',
    imageDigest,
    operator: 'source-operator-1',
    sampledAt: now,
    provenance: {
      evidenceKind: 'credential_lifecycle',
      collectionMethod: 'credential lifecycle captured through staging secret boundary',
      runner: 'scripts/check-live-reddit-oauth.ts',
      fixtureOnly: false,
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadsIncluded: false,
      credentialValuesIncluded: false,
      privateNetworkUrlsIncluded: false,
    },
    lifecycleOperations: [
      redditCredentialLifecycleOperation('create', now, 'Credential create recorded through the approved secret boundary.'),
      redditCredentialLifecycleOperation('rotate', now, 'Credential rotation replaced the active reference without exposing values.'),
      redditCredentialLifecycleOperation('revoke', now, 'Credential revoke disabled the previous reference and recorded audit evidence.'),
      redditCredentialLifecycleOperation('redacted-preview', now, 'Credential preview exposed only redacted metadata for operator review.'),
    ],
  };
}

function redditCredentialLifecycleOperation(operation, observedAt, summary) {
  return {
    operation,
    status: 'passed',
    observedAt,
    evidence: {
      summary,
      secretValuesRedacted: true,
      auditEventRecorded: true,
    },
  };
}

function liveRedditArtifact(lifecycleArtifactSha256) {
  const now = new Date().toISOString();
  const imageDigest = `sha256:${'b'.repeat(64)}`;
  return {
    schemaVersion: 1,
    format: 'source-live-provider-evidence-v1',
    artifactId: 'live-reddit-oauth-evidence-v1',
    environmentId: 'source-reddit-alpha',
    imageDigest,
    operator: 'source-operator-1',
    sampledAt: now,
    provenance: {
      evidenceKind: 'live_network',
      collectionMethod: 'live Reddit OAuth smoke captured on staging beta environment',
      runner: 'scripts/check-live-reddit-oauth.ts',
      fixtureOnly: false,
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadsIncluded: false,
      credentialValuesIncluded: false,
      privateNetworkUrlsIncluded: false,
    },
    environment: {
      environmentId: 'source-reddit-alpha',
      imageDigest,
      operator: 'source-operator-1',
      sampledAt: now,
    },
    providerResults: [
      {
        providerKey: 'reddit',
        status: 'passed',
        signalResults: [
          {
            signalId: 'reddit-tenant-oauth-smoke',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'Tenant-owned Reddit OAuth credential returned normalized listing items.',
              subreddit: 'programming',
              listing: 'hot',
              itemCount: 3,
              canonicalUrlsObserved: true,
              warningCount: 0,
            },
          },
          {
            signalId: 'reddit-auth-failure',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'Invalid Reddit OAuth credential failed closed with classified auth failure.',
              status: 'failed_closed',
              failedClosed: true,
            },
          },
          {
            signalId: 'reddit-rate-limit-budget',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'Reddit rate limit headers were observed and recorded without token values.',
              headersObserved: true,
              observedHeaderNames: [
                'x-ratelimit-remaining',
                'x-ratelimit-used',
                'x-ratelimit-reset',
              ],
            },
          },
          {
            signalId: 'reddit-credential-lifecycle',
            status: 'passed',
            observedAt: now,
            evidence: {
              summary: 'Credential create, rotate, revoke and redacted preview lifecycle artifact was hashed.',
              lifecycleArtifactSha256,
              redactionChecked: true,
              lifecycleOperations: ['create', 'rotate', 'revoke', 'redacted-preview'],
            },
          },
        ],
      },
    ],
  };
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
    if (
      artifact.expectedArtifactId !== undefined
      && (typeof artifact.expectedArtifactId !== 'string' || artifact.expectedArtifactId.trim().length === 0)
    ) {
      violations.push(`${label}: output artifact expectedArtifactId must be a non-empty string`);
    }
    if (
      artifact.env !== undefined
      && artifact.format === 'staging-reliability-artifact-v1'
      && typeof artifact.expectedArtifactId !== 'string'
    ) {
      violations.push(`${label}: staging reliability output artifact env "${artifact.env}" must define expectedArtifactId`);
    }
    validateExpectedProviderKeys(artifact, label);
    if (artifact.env !== undefined) {
      validateArtifactValidatorCoverage(job, artifact, label);
    }
  }
}

function validateArtifactValidatorCoverage(job, artifact, label) {
  const matchingValidator = job.validationCommands.some((command) => {
    const source = validationCommandSource(command);
    return source.includes(artifact.env) && source.includes(artifact.format);
  });

  if (!matchingValidator) {
    violations.push(
      `${label}: output artifact env "${artifact.env}" must be read by a validation command that checks format "${artifact.format}"`,
    );
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
      const artifactIdMatches = requiredArtifact.expectedArtifactId === undefined
        || artifact.expectedArtifactId === requiredArtifact.expectedArtifactId;
      const providerKeysMatch = requiredArtifact.expectedProviderKeys === undefined
        || providerKeysEqual(artifact.expectedProviderKeys, requiredArtifact.expectedProviderKeys);
      return refMatches && artifact.format === requiredArtifact.format && artifactIdMatches && providerKeysMatch;
    });
    if (!hasArtifact) {
      const artifactIdSuffix = requiredArtifact.expectedArtifactId === undefined
        ? ''
        : ` and expectedArtifactId "${requiredArtifact.expectedArtifactId}"`;
      const providerKeysSuffix = requiredArtifact.expectedProviderKeys === undefined
        ? ''
        : ` and expectedProviderKeys "${requiredArtifact.expectedProviderKeys.join(', ')}"`;
      violations.push(
        `${label}: outputArtifacts must include ${requiredArtifact.kind} "${requiredArtifact.ref}" with format "${requiredArtifact.format}"${artifactIdSuffix}${providerKeysSuffix}`,
      );
    }
  }
}

function validateExpectedProviderKeys(artifact, label) {
  if (
    artifact.env !== undefined
    && artifact.format === 'source-live-provider-evidence-v1'
    && artifact.expectedProviderKeys === undefined
  ) {
    violations.push(`${label}: source live output artifact env "${artifact.env}" must define expectedProviderKeys`);
    return;
  }
  if (artifact.expectedProviderKeys === undefined) {
    return;
  }
  if (
    !Array.isArray(artifact.expectedProviderKeys)
    || artifact.expectedProviderKeys.length === 0
    || artifact.expectedProviderKeys.some((providerKey) => typeof providerKey !== 'string' || providerKey.trim().length === 0)
  ) {
    violations.push(`${label}: output artifact expectedProviderKeys must be non-empty strings`);
    return;
  }
  if (new Set(artifact.expectedProviderKeys).size !== artifact.expectedProviderKeys.length) {
    violations.push(`${label}: output artifact expectedProviderKeys must not contain duplicates`);
  }
}

function providerKeysEqual(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    return false;
  }
  const actualKeys = new Set(actual);
  return expected.every((providerKey) => actualKeys.has(providerKey));
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
  const summaryScript = scriptNameFromCommand(contract.summaryCommand);
  const handoffScript = scriptNameFromCommand(contract.handoffCommand);
  const handoffJsonScript = scriptNameFromCommand(contract.handoffJsonCommand);
  const preflightScript = scriptNameFromCommand(contract.preflightCommand);
  const artifactValidationScript = scriptNameFromCommand(contract.artifactValidationCommand);
  const executeScript = scriptNameFromCommand(contract.executeCommand);

  for (const scriptName of [
    checkScript,
    planScript,
    jsonPlanScript,
    summaryScript,
    handoffScript,
    handoffJsonScript,
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
  if (!String(packageScripts[summaryScript] ?? '').includes('--summary')) {
    violations.push(`${packagePath}: ${summaryScript} must pass --summary`);
  }
  if (!String(packageScripts[handoffScript] ?? '').includes('--handoff')) {
    violations.push(`${packagePath}: ${handoffScript} must pass --handoff`);
  }
  if (!String(packageScripts[handoffJsonScript] ?? '').includes('--handoff-json')) {
    violations.push(`${packagePath}: ${handoffJsonScript} must pass --handoff-json`);
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
  for (const scriptName of [
    planScript,
    jsonPlanScript,
    summaryScript,
    handoffScript,
    handoffJsonScript,
    preflightScript,
    artifactValidationScript,
    executeScript,
  ]) {
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
  if (evidenceRunner.summaryCommand !== contract.summaryCommand) {
    violations.push(`${externalReadinessPath}: evidenceRunner.summaryCommand must match runner contract`);
  }
  if (evidenceRunner.handoffCommand !== contract.handoffCommand) {
    violations.push(`${externalReadinessPath}: evidenceRunner.handoffCommand must match runner contract`);
  }
  if (evidenceRunner.handoffJsonCommand !== contract.handoffJsonCommand) {
    violations.push(`${externalReadinessPath}: evidenceRunner.handoffJsonCommand must match runner contract`);
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

function validationCommandSource(command) {
  const scriptName = scriptNameFromCommand(command);
  if (scriptName === null) {
    return '';
  }

  const script = String(packageScripts[scriptName] ?? '');
  const referencedFiles = [...new Set([...script.matchAll(/\bscripts\/[^\s&|;]+?\.(?:mjs|js|ts)\b/g)].map((match) => match[0]))];
  return referencedFiles
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

function scriptNameFromCommand(command) {
  const match = /^npm run (?:--silent )?([^ ]+)/.exec(String(command ?? ''));
  return match?.[1] ?? null;
}
