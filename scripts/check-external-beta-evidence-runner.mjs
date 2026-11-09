import { validateSafety, validateArtifactFreshnessPolicy } from './lib/external-beta-execution-safety-policy.mjs';
import { createExternalBetaJobRequirementsPolicy } from './lib/external-beta-job-requirements-policy.mjs';
import {
  completeExternalEvidencePreflightEnv,
  durableBackendE2ePreflightEnv,
  postgresRestorePreflightEnv,
  rabbitmqDrillPreflightEnv,
  redditOAuthPreflightEnv,
} from './lib/external-beta-evidence-preflight-fixtures.mjs';
import { validateRunnerImplementationMarkers, redactionPolicyPath } from './lib/external-beta-evidence-runner-markers.mjs';
import {
  liveOpenConnectorsArtifact,
  redditCredentialLifecycleArtifact,
  liveRedditArtifact,
} from './lib/external-beta-source-live-artifacts.mjs';
import {
  stagingReliabilityArtifact,
  stagingReliabilitySmokeConfigByArtifactId,
  stagingReliabilitySmokeConfigs,
} from './lib/external-beta-staging-reliability-fixtures.mjs';

import {
  securityFinalSweepExportDocuments,
  securityFinalSweepArtifact,
} from './lib/external-beta-security-final-sweep-fixtures.mjs';

import { summaryFeedbackSamplesArtifact } from './lib/external-beta-summary-feedback-fixtures.mjs';

import {
  sourceCredentialRotationArtifact,
  webhookSecretRotationArtifact,
} from './lib/external-beta-credential-rotation-fixtures.mjs';

import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const contractPath = 'ops/release/external-beta-evidence-runner.json';
const externalReadinessPath = 'ops/release/external-beta-readiness-contract.json';
const auditPath = 'ops/release/backend-mvp-completion-audit.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';
const packagePath = 'package.json';
const selectionHelperPath = 'scripts/lib/external-beta-evidence-selections.mjs';
const sourceCertificationPath = 'ops/ingestion/source-provider-certification.json';

const contract = readJson(contractPath);
const externalReadiness = readJson(externalReadinessPath);
const audit = readJson(auditPath);
const backendSafe = readJson(backendSafePath);
const baseline = readJson(baselinePath);
const packageJson = readJson(packagePath);
const sourceCertification = readJson(sourceCertificationPath);
const sourceLiveArtifactContext = { sourceCertification, sourceCertificationPath };
const runnerSource = readFileSync(contract.runnerFile, 'utf8');
const selectionHelperSource = readFileSync(selectionHelperPath, 'utf8');
const envExampleSource = typeof contract.envExample === 'string' && existsSync(contract.envExample)
  ? readFileSync(contract.envExample, 'utf8')
  : '';
const packageScripts = packageJson.scripts ?? {};
const backendScripts = new Set(backendSafe.backendScripts ?? []);
const baselineScripts = new Set(baseline.requiredGreenScripts ?? []);
const baselineArtifacts = new Set((baseline.trackedArtifacts ?? []).map((artifact) => artifact.path));
const externalGroups = new Map((externalReadiness.requiredEvidenceGroups ?? []).map((group) => [group.groupId, group]));
const auditRequirements = new Map((audit.requirements ?? []).map((requirement) => [requirement.requirementId, requirement]));
const checkSource = readFileSync(contract.checkFile, 'utf8');
const violations = [];
const artifactValidationSmokeTimeoutMs = 300_000;
const strictSemanticNegativeSmokeLabels = new Set([
  'durable runtime in-memory selector',
  'durable runtime missing event relay',
  'durable runtime forbidden rollup',
  'staging reliability missing postgres signal',
  'staging reliability failed durable signal',
  'summary feedback fixture sample id',
  'summary feedback fixture sample signal text',
  'summary feedback non-real source kind',
  'summary feedback missing source export traceability',
  'summary feedback raw source redaction flag',
  'summary feedback missing minimum samples',
  'summary feedback rollup mismatch',
  'summary feedback forbidden sensitive field',
  'release deploy commit mismatch',
  'release deploy artifact digest mismatch',
  'release deploy missing smoke result',
  'release deploy raw headers redaction flag',
  'source rotation missing preview operation',
  'webhook rotation unchanged old key',
  'security sweep missing public error export',
  'security sweep missing audit metadata export',
  'security sweep mismatched export digest',
  'security sweep unsafe diagnostic field',
  'security sweep raw source redaction flag',
  'reddit lifecycle hash mismatch',
  'reddit lifecycle missing redacted preview',
  'reddit lifecycle non ISO observedAt',
  'reddit live signal non ISO observedAt',
]);
const representativeSemanticNegativeSmokeLabels = new Set([
  'durable runtime in-memory selector',
  'staging reliability missing postgres signal',
  'summary feedback fixture sample id',
  'release deploy commit mismatch',
  'source rotation missing preview operation',
  'security sweep missing public error export',
  'reddit lifecycle hash mismatch',
]);
const runnerSmokeTimeoutMs = 30_000;

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
      'BACKEND_GIT_COMMIT_SHA',
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
      'BACKEND_GIT_COMMIT_SHA',
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
      'AUDIT_EVENT_EXPORT_PATH',
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
      'INFINITY_CONTEXT_URL',
      'INFINITY_CONTEXT_TOKEN',
    ],
  ],
  [
    'relevance-memory-runtime-canary',
    [
      'DATABASE_URL',
      'INFINITY_CONTEXT_URL',
      'INFINITY_CONTEXT_TOKEN',
      'RELEVANCE_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH',
      'RELEVANCE_MEMORY_RUNTIME_CANARY_PERSISTENCE',
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
  [
    'live-github-repo-radar',
    [
      'GITHUB_REPO_RADAR_PRISMA_LIVE_E2E',
      'GITHUB_REPO_RADAR_BIGQUERY_PROJECT_ID',
      'GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH',
      'DATABASE_URL',
      'SOURCE_LIVE_ENVIRONMENT_ID',
      'BACKEND_IMAGE_DIGEST',
      'BACKEND_GIT_COMMIT_SHA',
      'SOURCE_LIVE_OPERATOR',
    ],
  ],
  [
    'live-github-trending-page',
    [
      'GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH',
      'SOURCE_LIVE_ENVIRONMENT_ID',
      'BACKEND_IMAGE_DIGEST',
      'BACKEND_GIT_COMMIT_SHA',
      'SOURCE_LIVE_OPERATOR',
    ],
  ],
]);
const requiredJobOptionalEnvNames = new Map([
  ['live-open-connectors', ['GITHUB_ACCESS_TOKEN']],
  ['live-github-repo-radar', ['GITHUB_ACCESS_TOKEN']],
  ['live-github-trending-page', ['GITHUB_TRENDING_PAGE_USER_AGENT']],
  [
    'live-reddit-oauth',
    [
      'REDDIT_APP_CLIENT_ID',
      'REDDIT_APP_CLIENT_SECRET',
      'REDDIT_CLIENT_ID',
      'REDDIT_CLIENT_SECRET',
      'REDDIT_REFRESH_TOKEN',
      'REDDIT_USER_AGENT',
      'REDDIT_SUBREDDIT',
      'REDDIT_LISTING',
    ],
  ],
  [
    'summary-real-feedback-import',
    [
      'SUMMARY_FEEDBACK_TRIAGE_OWNER',
      'SUMMARY_FEEDBACK_REDACTED_INPUT_PATH',
      'SUMMARY_FEEDBACK_EXPORT_ENV_PATH',
      'SUMMARY_FEEDBACK_TENANT_ID',
      'SUMMARY_FEEDBACK_WORKSPACE_ID',
      'SUMMARY_FEEDBACK_WINDOW_STARTED_AT',
      'SUMMARY_FEEDBACK_WINDOW_ENDED_AT',
      'SUMMARY_FEEDBACK_EXPORT_LIMIT',
      'SUMMARY_FEEDBACK_MIN_SAMPLES',
      'SUMMARY_FEEDBACK_SOURCE_KIND',
      'SUMMARY_FEEDBACK_ENVIRONMENT_ID',
      'SUMMARY_FEEDBACK_OPERATOR',
      'SUMMARY_FEEDBACK_COLLECTION_METHOD',
      'SUMMARY_FEEDBACK_REDACTED_BY',
      'SUMMARY_FEEDBACK_APPROVED_BY',
      'SUMMARY_FEEDBACK_EXPORT_SOURCE_SYSTEM',
      'SUMMARY_FEEDBACK_EXPORT_ID',
      'SUMMARY_FEEDBACK_EXPORTED_AT',
      'SUMMARY_FEEDBACK_REVIEW_QUEUE',
      'SUMMARY_FEEDBACK_REDACTION_REVIEW_ID',
      'SUMMARY_FEEDBACK_APPROVAL_REFERENCE',
    ],
  ],
]);
const requiredJobEnvAlternatives = new Map([
  ['durable-runtime-staging-proof', [
    {
      label: 'docker_backend_staging_bundle',
      env: ['BACKEND_STAGING_EVIDENCE_BUNDLE_PATH'],
      coversEnv: ['API_BASE_URL'],
    },
  ]],
  ['live-reddit-oauth', [
    {
      label: 'reddit_access_token',
      env: ['REDDIT_ACCESS_TOKEN'],
      coversEnv: ['REDDIT_ACCESS_TOKEN'],
      mode: 'live_command_credential',
    },
    {
      label: 'reddit_refresh_token_flow',
      env: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_REFRESH_TOKEN'],
      coversEnv: ['REDDIT_ACCESS_TOKEN'],
      mode: 'live_command_credential',
    },
    {
      label: 'reddit_app_refresh_token_flow',
      env: ['REDDIT_APP_CLIENT_ID', 'REDDIT_APP_CLIENT_SECRET', 'REDDIT_REFRESH_TOKEN'],
      coversEnv: ['REDDIT_ACCESS_TOKEN'],
      mode: 'live_command_credential',
    },
    {
      label: 'reddit_captured_live_artifacts',
      env: ['REDDIT_LIVE_EVIDENCE_PATH', 'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH'],
      coversEnv: ['REDDIT_ACCESS_TOKEN'],
      mode: 'captured_artifact',
    },
  ]],
  ['live-github-repo-radar', [
    {
      label: 'github_repo_radar_captured_live_artifact',
      env: ['GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH'],
      coversEnv: ['DATABASE_URL'],
      mode: 'captured_artifact',
    },
  ]],
  ['rabbitmq-staging-reliability-drill', [
    {
      label: 'docker_backend_staging_bundle',
      env: ['BACKEND_STAGING_EVIDENCE_BUNDLE_PATH'],
      coversEnv: ['RABBITMQ_URL'],
    },
  ]],
  ['postgres-restore-migration-drill', [
    {
      label: 'docker_backend_staging_bundle',
      env: ['BACKEND_STAGING_EVIDENCE_BUNDLE_PATH'],
      coversEnv: ['DATABASE_URL'],
    },
  ]],
  ['durable-backend-e2e-loop', [
    {
      label: 'docker_backend_staging_bundle',
      env: ['BACKEND_STAGING_EVIDENCE_BUNDLE_PATH'],
      coversEnv: ['API_BASE_URL', 'INFINITY_CONTEXT_URL', 'INFINITY_CONTEXT_TOKEN'],
      mode: 'captured_artifact',
    },
  ]],
  ['relevance-memory-runtime-canary', [
    {
      label: 'relevance_memory_captured_canary_artifact',
      env: ['RELEVANCE_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH'],
      coversEnv: ['DATABASE_URL', 'INFINITY_CONTEXT_URL', 'INFINITY_CONTEXT_TOKEN'],
      mode: 'captured_artifact',
    },
  ]],
  ['release-deploy-smoke', [
    {
      label: 'docker_backend_staging_bundle',
      env: ['BACKEND_STAGING_EVIDENCE_BUNDLE_PATH'],
      coversEnv: ['API_BASE_URL'],
    },
  ]],
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
        expectedProviderKeys: ['hacker-news', 'rss', 'github-issues'],
      },
    ],
  ],
  [
    'live-github-repo-radar',
    [
      {
        kind: 'env',
        ref: 'GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH',
        format: 'source-live-provider-evidence-v1',
        expectedArtifactId: 'github-repo-radar-live-evidence-v1',
        expectedProviderKeys: ['github-repo-radar'],
      },
    ],
  ],
  [
    'live-github-trending-page',
    [
      {
        kind: 'env',
        ref: 'GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH',
        format: 'source-live-provider-evidence-v1',
        expectedArtifactId: 'github-trending-page-live-evidence-v1',
        expectedProviderKeys: ['github-trending-page'],
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
    'relevance-memory-runtime-canary',
    [
      {
        kind: 'env',
        ref: 'RELEVANCE_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH',
        format: 'relevance-memory-runtime-canary-v1',
        expectedArtifactId: 'relevance-memory-runtime-canary-v1',
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
const requiredSourceLiveCertificationJobIds = [
  'live-open-connectors',
  'live-github-repo-radar',
  'live-github-trending-page',
  'live-reddit-oauth',
];

const {
  validateEnvExample,
  validateJobBasics,
  validateJobCommands,
  validateJobEnvironment,
  validateJobScopeSafety,
} = createExternalBetaJobRequirementsPolicy({
  violations, contract, contractPath, envExampleSource, allowedModes, allowedRunPolicies,
  externalGroups, auditRequirements, backendScripts, forbiddenFragments,
  validateCommand, scriptNameFromCommand,
});

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
validateCommand(contract.dockerBundleImportCommand, `${contractPath}: dockerBundleImportCommand`);
validateCommand(contract.currentPackageCommand, `${contractPath}: currentPackageCommand`);
validateCommand(contract.executeCommand, `${contractPath}: executeCommand`);
validateSafety({ contract, contractPath, forbiddenFragments, violations });
validateArtifactFreshnessPolicy({ contract, contractPath, violations });
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
validateRunnerPositiveSummaryFeedbackArtifactSmoke();
validateRunnerNegativeSummaryFeedbackArtifactSmokes();
validateRunnerPositiveReleaseDeployArtifactSmoke();
validateRunnerNegativeReleaseDeployArtifactSmokes();
validateRunnerPositiveArtifactSmoke();
validateRunnerPositiveRedditArtifactSmoke();
validateRunnerNegativeRedditArtifactSmokes();
validateRunnerNegativeSmokes();
validateRunnerPreflightNegativeSmokes();
validateRunnerLocalRuntimePlanSmoke();
validateRunnerDockerBundleAlternativeSmoke();
validateRunnerOutputRedactionSmoke();
validateRunnerEnvFileSmokes();
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
  violations.push(...validateRunnerImplementationMarkers({
    runnerSource,
    checkSource,
    selectionHelperSource,
    redactionPolicySource: readFileSync(redactionPolicyPath, 'utf8'),
    runnerFile: contract.runnerFile,
    checkFile: contract.checkFile,
    selectionHelperPath,
  }));
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
      label: 'raw duplicate-key credential hidden by JSON parser',
      expectedOutput: 'sensitive literal fragment "bearer "',
      artifactContent: (base) => {
        const artifact = {
          ...base,
          diagnostics: {
            authorization: 'redacted',
          },
        };
        return `${JSON.stringify(artifact, null, 2)}\n`.replace(
          '"authorization": "redacted"',
          [
            '"authorization": "',
            ['Bearer', ' raw-live-token-hidden-by-duplicate-key'].join(''),
            '",\n    "authorization": "redacted"',
          ].join(''),
        );
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
      expectedOutput: 'must include providerKey github-issues',
      artifact: (base) => ({
        ...base,
        providerResults: base.providerResults.filter((result) => result.providerKey !== 'github-issues'),
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
    {
      label: 'environment commit sha mismatch',
      expectedOutput: 'commitSha must match BACKEND_GIT_COMMIT_SHA',
      artifact: (base) => ({
        ...base,
        environment: {
          ...base.environment,
          commitSha: '0'.repeat(40),
        },
      }),
    },
    {
      label: 'nested fixture marker',
      expectedOutput: 'must not contain fixture marker "example"',
      artifact: (base) => {
        const artifact = JSON.parse(JSON.stringify(base));
        artifact.providerResults[0].signalResults[0].evidence.sampleId = 'live-open-example-001';
        return artifact;
      },
    },
    {
      label: 'world-readable evidence artifact',
      expectedOutput: '0600-style private file permissions',
      fileMode: 0o644,
      artifact: (base) => base,
    },
  ];

  for (const scenario of scenarios) {
    if (!shouldRunNegativeSmoke(scenario.label)) {
      continue;
    }
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-negative-'));
    const artifactPath = join(tempDirectory, 'live-open-connectors.json');
    const baseArtifact = liveOpenConnectorsArtifact(sourceLiveArtifactContext);
    const artifact = typeof scenario.artifact === 'function'
      ? scenario.artifact(baseArtifact)
      : {
        ...baseArtifact,
        ...scenario.artifactPatch,
      };
    try {
      writeFileSync(
        artifactPath,
        typeof scenario.artifactContent === 'function'
          ? scenario.artifactContent(artifact)
          : `${JSON.stringify(artifact, null, 2)}\n`,
        { mode: 0o600 },
      );
      if (scenario.fileMode !== undefined) {
        chmodSync(artifactPath, scenario.fileMode);
      }

      const result = runRunnerNegativeSmoke(artifactPath, negativeSmokeOptions(scenario.label));
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
      `${JSON.stringify(liveOpenConnectorsArtifact(sourceLiveArtifactContext), null, 2)}\n`,
      { mode: 0o600 },
    );

    const result = runRunnerArtifactSmoke(artifactPath, { contractSmokeArtifactOnly: true });
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
    const result = runRunnerDurableRuntimeArtifactSmoke(artifactPath, { contractSmokeArtifactOnly: true });
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
    {
      label: 'durable runtime nested fixture marker',
      expectedOutput: 'must not contain fixture marker "example"',
      mutateArtifact: (artifact) => {
        artifact.services[0].healthCheck.probeId = 'runtime-selector-example-001';
      },
    },
    {
      label: 'durable runtime raw duplicate-key credential hidden by JSON parser',
      expectedOutput: 'sensitive literal fragment "bearer "',
      artifactContent: (artifact) => `${JSON.stringify(artifact, null, 2)}\n`.replace(
        '"operator": "release-operator-1"',
        [
          '"operator": "',
          ['Bearer', ' raw-runtime-token-hidden-by-duplicate-key'].join(''),
          '",\n    "operator": "release-operator-1"',
        ].join(''),
      ),
    },
  ];

  for (const scenario of scenarios) {
    if (!shouldRunNegativeSmoke(scenario.label)) {
      continue;
    }
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-durable-negative-'));
    try {
      const artifactPath = writeDurableRuntimeSelectorArtifact(tempDirectory, scenario);
      const result = runRunnerDurableRuntimeArtifactSmoke(artifactPath, negativeSmokeOptions(scenario.label));
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
  const artifactContent = typeof options.artifactContent === 'function'
    ? options.artifactContent(artifact)
    : `${JSON.stringify(artifact, null, 2)}\n`;
  writeFileSync(
    artifactPath,
    artifactContent,
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
      const result = runRunnerStagingReliabilityArtifactSmoke(config, artifactPath, { contractSmokeArtifactOnly: true });
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
    {
      label: 'staging reliability nested fixture marker',
      artifactId: 'rabbitmq-staging-drill-output',
      expectedOutput: 'must not contain fixture marker "example"',
      mutateArtifact: (artifact) => {
        artifact.signalResults[0].evidence.messageId = 'msg-rabbitmq-confirm-example';
      },
    },
    {
      label: 'staging reliability raw duplicate-key credential hidden by JSON parser',
      artifactId: 'rabbitmq-staging-drill-output',
      expectedOutput: 'sensitive literal fragment "bearer "',
      artifactContent: (artifact) => `${JSON.stringify(artifact, null, 2)}\n`.replace(
        '"summary": "redacted publisher confirm ack observed"',
        [
          '"summary": "',
          ['Bearer', ' raw-staging-token-hidden-by-duplicate-key'].join(''),
          '",\n            "summary": "redacted publisher confirm ack observed"',
        ].join(''),
      ),
    },
  ];

  for (const scenario of scenarios) {
    if (!shouldRunNegativeSmoke(scenario.label)) {
      continue;
    }
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-staging-reliability-negative-'));
    try {
      const config = stagingReliabilitySmokeConfigByArtifactId(scenario.artifactId);
      const artifactPath = writeStagingReliabilityArtifact(tempDirectory, config, scenario);
      const result = runRunnerStagingReliabilityArtifactSmoke(config, artifactPath, negativeSmokeOptions(scenario.label));
      if (result.exitCode === 0) {
        violations.push(`${contract.runnerFile}: runner negative staging reliability smoke must reject ${scenario.label}`);
        continue;
      }
      if (!result.output.includes(scenario.expectedOutput)) {
        violations.push(`${contract.runnerFile}: runner negative staging reliability smoke for ${scenario.label} must report "${scenario.expectedOutput}"; observed: ${smokeOutputSnippet(result.output)}`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function writeStagingReliabilityArtifact(tempDirectory, config, options = {}) {
  const artifactPath = join(tempDirectory, `${config.artifactId}.json`);
  const artifact = stagingReliabilityArtifact(config, readJson('ops/drills/fixtures/staging-reliability-artifact-examples.json'));
  options.mutateArtifact?.(artifact);
  const artifactContent = typeof options.artifactContent === 'function'
    ? options.artifactContent(artifact, config)
    : `${JSON.stringify(artifact, null, 2)}\n`;
  writeFileSync(
    artifactPath,
    artifactContent,
    { mode: 0o600 },
  );
  return artifactPath;
}

function validateRunnerPositiveSummaryFeedbackArtifactSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-summary-feedback-positive-'));
  try {
    const artifactPath = writeSummaryFeedbackSamplesArtifact(tempDirectory);
    const result = runRunnerSummaryFeedbackArtifactSmoke(artifactPath, { contractSmokeArtifactOnly: true });
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner positive summary feedback artifact smoke must accept valid redacted feedback samples: ${smokeOutputSnippet(result.output)}`);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function validateRunnerNegativeSummaryFeedbackArtifactSmokes() {
  const scenarios = [
    {
      label: 'summary feedback fixture sample id',
      expectedOutput: 'real feedback sample must not reuse fixture sample id',
      mutateArtifact: (artifact) => {
        artifact.samples[0].feedbackId = 'redacted-feedback-wrong-fact-001';
        artifact.rollup.blockerSampleIds[0] = 'redacted-feedback-wrong-fact-001';
      },
    },
    {
      label: 'summary feedback fixture sample signal text',
      expectedOutput: 'real feedback sample must not copy fixture sample signal text',
      mutateArtifact: (artifact) => {
        artifact.samples[0].sanitizedSignal = 'Summary asserted a decision that was not supported by the cited redacted item.';
        artifact.samples[0].redactedComment = 'The cited source only says review is pending, but the summary says it was approved.';
      },
    },
    {
      label: 'summary feedback fixture provenance',
      expectedOutput: 'must not contain fixture provenance',
      mutateArtifact: (artifact) => {
        artifact.provenance = {
          evidenceKind: 'fixture_example',
          collectionMethod: 'Synthetic fixture example for summary feedback sample schema validation.',
          runner: 'ops/release/fixtures/redacted-summary-feedback-samples-examples.json',
          fixtureOnly: true,
        };
      },
    },
    {
      label: 'summary feedback non-real source kind',
      expectedOutput: 'real sample source.kind must be one of internal_dogfood, private_beta',
      mutateArtifact: (artifact) => {
        artifact.source.kind = 'example_redacted_dogfood';
      },
    },
    {
      label: 'summary feedback missing source export traceability',
      expectedOutput: 'source.export must be an object',
      mutateArtifact: (artifact) => {
        delete artifact.source.export;
      },
    },
    {
      label: 'summary feedback raw source redaction flag',
      expectedOutput: 'redaction.rawSourceTextIncluded must be false',
      mutateArtifact: (artifact) => {
        artifact.redaction.rawSourceTextIncluded = true;
      },
    },
    {
      label: 'summary feedback missing minimum samples',
      expectedOutput: 'samples must include at least 2 samples',
      mutateArtifact: (artifact) => {
        artifact.samples = [artifact.samples[0]];
        artifact.source.sampleCount = 1;
      },
    },
    {
      label: 'summary feedback rollup mismatch',
      expectedOutput: 'rollup.releaseBlockingSamples must match releaseBlocking samples',
      mutateArtifact: (artifact) => {
        artifact.rollup.releaseBlockingSamples = 0;
      },
    },
    {
      label: 'summary feedback forbidden sensitive field',
      expectedOutput: 'forbidden sensitive field "authorization"',
      mutateArtifact: (artifact) => {
        artifact.samples[0].summaryEvidence.authorization = 'redacted-header-name-only';
      },
    },
    {
      label: 'summary feedback raw duplicate-key credential hidden by JSON parser',
      expectedOutput: 'sensitive literal fragment "bearer "',
      artifactContent: (artifact) => `${JSON.stringify(artifact, null, 2)}\n`.replace(
        '"redactedComment": "Reviewer noted that the redacted item showed a pending state while the summary used approved wording."',
        [
          '"redactedComment": "',
          ['Bearer', ' raw-summary-feedback-token-hidden-by-duplicate-key'].join(''),
          '",\n      "redactedComment": "Reviewer noted that the redacted item showed a pending state while the summary used approved wording."',
        ].join(''),
      ),
    },
  ];

  for (const scenario of scenarios) {
    if (!shouldRunNegativeSmoke(scenario.label)) {
      continue;
    }
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-summary-feedback-negative-'));
    try {
      const artifactPath = writeSummaryFeedbackSamplesArtifact(tempDirectory, scenario);
      const result = runRunnerSummaryFeedbackArtifactSmoke(artifactPath, negativeSmokeOptions(scenario.label));
      if (result.exitCode === 0) {
        violations.push(`${contract.runnerFile}: runner negative summary feedback smoke must reject ${scenario.label}`);
        continue;
      }
      if (!result.output.includes(scenario.expectedOutput)) {
        violations.push(`${contract.runnerFile}: runner negative summary feedback smoke for ${scenario.label} must report "${scenario.expectedOutput}"; observed: ${smokeOutputSnippet(result.output)}`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function writeSummaryFeedbackSamplesArtifact(tempDirectory, options = {}) {
  const artifactPath = join(tempDirectory, 'summary-real-feedback-samples.json');
  const artifact = summaryFeedbackSamplesArtifact(readJson('ops/release/fixtures/redacted-summary-feedback-samples-examples.json'));
  options.mutateArtifact?.(artifact);
  const artifactContent = typeof options.artifactContent === 'function'
    ? options.artifactContent(artifact)
    : `${JSON.stringify(artifact, null, 2)}\n`;
  writeFileSync(
    artifactPath,
    artifactContent,
    { mode: 0o600 },
  );
  return artifactPath;
}

function validateRunnerPositiveReleaseDeployArtifactSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-release-deploy-positive-'));
  try {
    const artifactPath = writeReleaseDeploySmokeArtifact(tempDirectory);
    const result = runRunnerReleaseDeployArtifactSmoke(artifactPath, { contractSmokeArtifactOnly: true });
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner positive release deploy artifact smoke must accept valid deploy smoke evidence: ${smokeOutputSnippet(result.output)}`);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function validateRunnerNegativeReleaseDeployArtifactSmokes() {
  const scenarios = [
    {
      label: 'release deploy fixture provenance',
      expectedOutput: 'must not contain fixture provenance',
      mutateArtifact: (artifact) => {
        artifact.provenance = {
          evidenceKind: 'fixture_example',
          collectionMethod: 'Synthetic fixture example for release deploy smoke schema validation.',
          runner: 'ops/release/fixtures/release-deploy-smoke-artifact-examples.json',
          fixtureOnly: true,
        };
      },
    },
    {
      label: 'release deploy image digest mismatch',
      expectedOutput: 'imageDigest must match BACKEND_IMAGE_DIGEST',
      mutateArtifact: (artifact) => {
        artifact.imageDigest = `sha256:${'9'.repeat(64)}`;
      },
    },
    {
      label: 'release deploy commit mismatch',
      expectedOutput: 'commitSha must match current release commit',
      mutateArtifact: (artifact) => {
        artifact.commitSha = '0'.repeat(40);
      },
    },
    {
      label: 'release deploy artifact digest mismatch',
      expectedOutput: 'artifact digest "openapi-snapshot" value must match release evidence',
      mutateArtifact: (artifact) => {
        const digest = artifact.artifactDigests.find((item) => item.artifactId === 'openapi-snapshot');
        digest.value = '0'.repeat(64);
      },
    },
    {
      label: 'release deploy missing smoke result',
      expectedOutput: 'missing smokeResult "worker-pause-resume"',
      mutateArtifact: (artifact) => {
        artifact.smokeResults = artifact.smokeResults.filter(
          (result) => result.smokeId !== 'worker-pause-resume',
        );
      },
    },
    {
      label: 'release deploy raw headers redaction flag',
      expectedOutput: 'redaction.rawHeadersIncluded must be false',
      mutateArtifact: (artifact) => {
        artifact.redaction.rawHeadersIncluded = true;
      },
    },
    {
      label: 'release deploy nested fixture marker',
      expectedOutput: 'must not contain fixture marker "example"',
      mutateArtifact: (artifact) => {
        artifact.smokeResults[0].evidence.sampleId = 'release-deploy-example-001';
      },
    },
  ];

  for (const scenario of scenarios) {
    if (!shouldRunNegativeSmoke(scenario.label)) {
      continue;
    }
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-release-deploy-negative-'));
    try {
      const artifactPath = writeReleaseDeploySmokeArtifact(tempDirectory, scenario);
      const result = runRunnerReleaseDeployArtifactSmoke(artifactPath, negativeSmokeOptions(scenario.label));
      if (result.exitCode === 0) {
        violations.push(`${contract.runnerFile}: runner negative release deploy smoke must reject ${scenario.label}`);
        continue;
      }
      if (!result.output.includes(scenario.expectedOutput)) {
        violations.push(`${contract.runnerFile}: runner negative release deploy smoke for ${scenario.label} must report "${scenario.expectedOutput}"`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function writeReleaseDeploySmokeArtifact(tempDirectory, options = {}) {
  const artifactPath = join(tempDirectory, 'release-deploy-smoke.json');
  const artifact = releaseDeploySmokeArtifact();
  options.mutateArtifact?.(artifact);
  writeFileSync(
    artifactPath,
    `${JSON.stringify(artifact, null, 2)}\n`,
    { mode: 0o600 },
  );
  return artifactPath;
}

function releaseDeploySmokeArtifact() {
  const releaseEvidence = readJson('ops/release/release-artifact-evidence.json');
  const fixture = readJson('ops/release/fixtures/release-deploy-smoke-artifact-examples.json');
  const artifact = JSON.parse(JSON.stringify(fixture.examples[0]));
  const imageDigest = releaseDeploySmokeImageDigest();
  const sampledAt = new Date(Date.now() - 60 * 1000).toISOString();
  const openApiDigest = releaseEvidence.artifactDigests.find((item) => item.artifactId === 'openapi-snapshot')?.value;
  const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

  artifact.artifactId = 'backend-release-deploy-smoke-staging-alpha-1';
  artifact.environmentId = 'staging-alpha-1';
  artifact.imageDigest = imageDigest;
  artifact.apiBaseUrl = 'https://api.staging.social-monitor.invalid';
  artifact.commitSha = gitSha;
  artifact.migrationVersion = releaseEvidence.migrationVersion;
  artifact.operator = 'release-owner-1';
  artifact.sampledAt = sampledAt;
  artifact.provenance = {
    evidenceKind: 'staging_deploy',
    collectionMethod: 'Deploy smoke evidence captured from beta backend staging release.',
    runner: 'scripts/capture-release-deploy-smoke.ts',
    fixtureOnly: false,
  };
  artifact.artifactDigests = releaseEvidence.artifactDigests;
  artifact.smokeResults = artifact.smokeResults.map((result, index) => {
    const observedAt = new Date(Date.parse(sampledAt) + (index + 1) * 1000).toISOString();
    const refreshed = {
      ...result,
      observedAt,
    };
    if (refreshed.smokeId === 'openapi-contract') {
      refreshed.evidence.deployedOpenApiSha256 = openApiDigest;
      refreshed.evidence.committedOpenApiSha256 = openApiDigest;
    }
    if (refreshed.smokeId === 'migration-version') {
      refreshed.evidence.deployedMigrationValue = releaseEvidence.migrationVersion.value;
      refreshed.evidence.releaseMigrationValue = releaseEvidence.migrationVersion.value;
    }
    return refreshed;
  });

  return artifact;
}

function releaseDeploySmokeImageDigest() {
  return `sha256:${'4'.repeat(64)}`;
}

function validateRunnerPositiveCredentialRotationArtifactSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-rotation-positive-'));
  try {
    const { sourceArtifactPath, webhookArtifactPath } = writeCredentialRotationArtifactPair(tempDirectory);
    const result = runRunnerCredentialRotationArtifactSmoke(sourceArtifactPath, webhookArtifactPath, { contractSmokeArtifactOnly: true });
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
    {
      label: 'source rotation nested fixture marker',
      expectedOutput: 'must not contain fixture marker "example"',
      mutateSource: (artifact) => {
        artifact.operations[0].safeEvidence.credentialRecordId = 'source-credential-example-001';
      },
    },
    {
      label: 'source rotation raw duplicate-key credential hidden by JSON parser',
      expectedOutput: 'sensitive literal fragment "bearer "',
      sourceContent: (artifact) => `${JSON.stringify(artifact, null, 2)}\n`.replace(
        '"plaintextObserved": false',
        [
          '"plaintextObserved": false,\n        "authorization": "',
          ['Bearer', ' raw-rotation-token-hidden-by-duplicate-key'].join(''),
          '",\n        "authorization": "redacted"',
        ].join(''),
      ),
    },
  ];

  for (const scenario of scenarios) {
    if (!shouldRunNegativeSmoke(scenario.label)) {
      continue;
    }
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-rotation-negative-'));
    try {
      const { sourceArtifactPath, webhookArtifactPath } = writeCredentialRotationArtifactPair(
        tempDirectory,
        scenario,
      );
      const result = runRunnerCredentialRotationArtifactSmoke(sourceArtifactPath, webhookArtifactPath, negativeSmokeOptions(scenario.label));
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
  const sourceArtifact = sourceCredentialRotationArtifact(readJson('ops/security/fixtures/source-credential-rotation-redacted-examples.json'));
  const webhookArtifact = webhookSecretRotationArtifact(readJson('ops/security/fixtures/webhook-secret-rotation-redacted-examples.json'));
  options.mutateSource?.(sourceArtifact);
  options.mutateWebhook?.(webhookArtifact);
  writeFileSync(
    sourceArtifactPath,
    typeof options.sourceContent === 'function'
      ? options.sourceContent(sourceArtifact)
      : `${JSON.stringify(sourceArtifact, null, 2)}\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    webhookArtifactPath,
    typeof options.webhookContent === 'function'
      ? options.webhookContent(webhookArtifact)
      : `${JSON.stringify(webhookArtifact, null, 2)}\n`,
    { mode: 0o600 },
  );
  return { sourceArtifactPath, webhookArtifactPath };
}

function validateRunnerPositiveSecurityFinalSweepArtifactSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-security-positive-'));
  try {
    const { artifactPath, exportPaths } = writeSecurityFinalSweepArtifact(tempDirectory);
    const result = runRunnerSecurityFinalSweepArtifactSmoke(artifactPath, exportPaths, { contractSmokeArtifactOnly: true });
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
      label: 'security sweep missing audit metadata export',
      expectedOutput: 'sourceExports must include audit-metadata',
      mutateArtifact: (artifact) => {
        artifact.sourceExports = artifact.sourceExports.filter(
          (sourceExport) => sourceExport.surfaceId !== 'audit-metadata',
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
    {
      label: 'security sweep nested fixture marker',
      expectedOutput: 'must not contain fixture marker "example"',
      mutateArtifact: (artifact) => {
        artifact.surfaces[0].leakClassResults[0].sampleId = 'security-sweep-example-001';
      },
    },
    {
      label: 'security sweep raw duplicate-key credential hidden by JSON parser',
      expectedOutput: 'sensitive literal fragment "bearer "',
      artifactContent: (artifact) => `${JSON.stringify(artifact, null, 2)}\n`.replace(
        '"operator": "security-owner-1"',
        [
          '"operator": "',
          ['Bearer', ' raw-security-token-hidden-by-duplicate-key'].join(''),
          '",\n    "operator": "security-owner-1"',
        ].join(''),
      ),
    },
  ];

  for (const scenario of scenarios) {
    if (!shouldRunNegativeSmoke(scenario.label)) {
      continue;
    }
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-security-negative-'));
    try {
      const { artifactPath, exportPaths } = writeSecurityFinalSweepArtifact(
        tempDirectory,
        scenario,
      );
      const result = runRunnerSecurityFinalSweepArtifactSmoke(artifactPath, exportPaths, negativeSmokeOptions(scenario.label));
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
  const artifact = securityFinalSweepArtifact(exportPaths, readJson('ops/security/fixtures/security-final-sweep-staging-artifact-examples.json'));
  options.mutateArtifact?.(artifact, exportPaths);
  const artifactContent = typeof options.artifactContent === 'function'
    ? options.artifactContent(artifact, exportPaths)
    : `${JSON.stringify(artifact, null, 2)}\n`;
  writeFileSync(
    artifactPath,
    artifactContent,
    { mode: 0o600 },
  );
  return { artifactPath, exportPaths };
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
    auditMetadata: writeSecurityFinalSweepExport(
      tempDirectory,
      'audit-events-export.json',
      exportDocuments.auditMetadata,
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

function validateRunnerPositiveRedditArtifactSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-reddit-positive-'));
  try {
    const { liveArtifactPath, lifecyclePath } = writeRedditArtifactPair(tempDirectory);
    const result = runRunnerRedditArtifactSmoke(liveArtifactPath, lifecyclePath, { contractSmokeArtifactOnly: true });
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner positive Reddit artifact smoke must accept valid live Reddit evidence and lifecycle pair: ${smokeOutputSnippet(result.output)}`);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }

  const durableLifecycleDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-reddit-durable-lifecycle-'));
  try {
    const { liveArtifactPath, lifecyclePath } = writeRedditArtifactPair(durableLifecycleDirectory, {
      mutateLifecycle: (artifact) => {
        artifact.imageDigest = `sha256:${'c'.repeat(64)}`;
        artifact.commitSha = 'c'.repeat(40);
      },
    });
    const result = runRunnerRedditArtifactSmoke(liveArtifactPath, lifecyclePath, { contractSmokeArtifactOnly: true });
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner positive Reddit artifact smoke must accept a durable lifecycle artifact from a previous release image: ${smokeOutputSnippet(result.output)}`);
    }
  } finally {
    rmSync(durableLifecycleDirectory, { recursive: true, force: true });
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
      label: 'reddit lifecycle non ISO observedAt',
      expectedOutput: 'lifecycleOperations[0].observedAt must be an ISO timestamp',
      mutateLifecycle: (artifact) => {
        artifact.lifecycleOperations[0].observedAt = 'not-a-timestamp';
      },
    },
    {
      label: 'reddit live signal non ISO observedAt',
      expectedOutput: 'signalResult "reddit-tenant-oauth-smoke" observedAt must be an ISO timestamp',
      mutateLive: (artifact) => {
        artifact.providerResults[0].signalResults[0].observedAt = 'not-a-timestamp';
      },
    },
    {
      label: 'reddit live evidence missing provider',
      expectedOutput: 'must include providerKey reddit',
      mutateLive: (artifact) => {
        artifact.providerResults = [];
      },
    },
    {
      label: 'reddit live commit sha mismatch',
      expectedOutput: 'commitSha must match BACKEND_GIT_COMMIT_SHA',
      mutateLive: (artifact) => {
        artifact.commitSha = '0'.repeat(40);
      },
    },
    {
      label: 'reddit live nested fixture marker',
      expectedOutput: 'must not contain fixture marker "example"',
      mutateLive: (artifact) => {
        artifact.providerResults[0].signalResults[0].evidence.sampleId = 'reddit-live-example-001';
      },
    },
    {
      label: 'reddit lifecycle nested fixture marker',
      expectedOutput: 'must not contain fixture marker "example"',
      mutateLifecycle: (artifact) => {
        artifact.lifecycleOperations[0].evidence.sampleId = 'reddit-lifecycle-example-001';
      },
    },
  ];

  for (const scenario of scenarios) {
    if (!shouldRunNegativeSmoke(scenario.label)) {
      continue;
    }
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-reddit-negative-'));
    try {
      const { liveArtifactPath, lifecyclePath } = writeRedditArtifactPair(
        tempDirectory,
        scenario,
      );
      const result = runRunnerRedditArtifactSmoke(liveArtifactPath, lifecyclePath, negativeSmokeOptions(scenario.label));
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
  const liveArtifact = liveRedditArtifact(options.lifecycleArtifactSha256 ?? lifecycleSha256, sourceLiveArtifactContext);
  options.mutateLive?.(liveArtifact, lifecycleSha256);
  writeFileSync(lifecyclePath, lifecycleContent, { mode: 0o600 });
  writeFileSync(
    liveArtifactPath,
    `${JSON.stringify(liveArtifact, null, 2)}\n`,
    { mode: 0o600 },
  );
  return { liveArtifactPath, lifecyclePath, lifecycleSha256 };
}

function negativeSmokeOptions(label) {
  return {
    contractSmokeArtifactOnly: !strictSemanticNegativeSmokeLabels.has(label),
  };
}

function shouldRunNegativeSmoke(label) {
  return (
    !strictSemanticNegativeSmokeLabels.has(label) ||
    representativeSemanticNegativeSmokeLabels.has(label)
  );
}

function runRunnerNegativeSmoke(artifactPath, options = {}) {
  return runRunnerArtifactSmoke(artifactPath, options);
}

function runRunnerSecurityFinalSweepArtifactSmoke(artifactPath, exportPaths, options = {}) {
  return runRunnerValidateArtifactsSmoke('security-final-sweep-staging', {
    LOG_EXPORT_PATH: exportPaths.logs.path,
    METRICS_EXPORT_PATH: exportPaths.metrics.path,
    PUBLIC_ERROR_EXPORT_PATH: exportPaths.publicErrors.path,
    AUDIT_EVENT_EXPORT_PATH: exportPaths.auditMetadata.path,
    SECURITY_FINAL_SWEEP_ARTIFACT_PATH: artifactPath,
  }, options);
}

function runRunnerCredentialRotationArtifactSmoke(sourceArtifactPath, webhookArtifactPath, options = {}) {
  return runRunnerValidateArtifactsSmoke('credential-secret-rotation-drill', {
    SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH: sourceArtifactPath,
    STAGING_SECRET_STORE_ID: 'secret-store-staging-alpha-1',
    WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH: webhookArtifactPath,
  }, options);
}

function runRunnerDurableRuntimeArtifactSmoke(artifactPath, options = {}) {
  const imageDigest = `sha256:${'d'.repeat(64)}`;
  return runRunnerValidateArtifactsSmoke('durable-runtime-staging-proof', {
    API_BASE_URL: 'https://api.staging.social-monitor.invalid',
    BACKEND_IMAGE_DIGEST: imageDigest,
    DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH: artifactPath,
    STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
  }, options);
}

function runRunnerStagingReliabilityArtifactSmoke(config, artifactPath, options = {}) {
  return runRunnerValidateArtifactsSmoke(config.jobId, {
    BACKEND_IMAGE_DIGEST: config.imageDigest,
    STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
    [config.envName]: artifactPath,
    ...config.requiredEnv,
  }, options);
}

function runRunnerSummaryFeedbackArtifactSmoke(artifactPath, options = {}) {
  return runRunnerValidateArtifactsSmoke('summary-real-feedback-import', {
    SUMMARY_REAL_FEEDBACK_SAMPLES_PATH: artifactPath,
  }, options);
}

function runRunnerReleaseDeployArtifactSmoke(artifactPath, options = {}) {
  return runRunnerValidateArtifactsSmoke('release-deploy-smoke', {
    API_BASE_URL: 'https://api.staging.social-monitor.invalid',
    BACKEND_IMAGE_DIGEST: releaseDeploySmokeImageDigest(),
    RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH: artifactPath,
    STAGING_ENVIRONMENT_ID: 'staging-alpha-1',
  }, options);
}

function runRunnerArtifactSmoke(artifactPath, options = {}) {
  const imageDigest = `sha256:${'a'.repeat(64)}`;
  const commitSha = 'a'.repeat(40);
  return runRunnerValidateArtifactsSmoke('live-open-connectors', {
    BACKEND_IMAGE_DIGEST: imageDigest,
    BACKEND_GIT_COMMIT_SHA: commitSha,
    LIVE_OPEN_CONNECTORS_EVIDENCE_PATH: artifactPath,
    SOURCE_LIVE_ENVIRONMENT_ID: 'source-prod-alpha',
    SOURCE_LIVE_OPERATOR: 'release-operator-1',
  }, options);
}

function runRunnerRedditArtifactSmoke(liveArtifactPath, lifecyclePath, options = {}) {
  const imageDigest = `sha256:${'b'.repeat(64)}`;
  const commitSha = 'b'.repeat(40);
  return runRunnerValidateArtifactsSmoke('live-reddit-oauth', {
    BACKEND_IMAGE_DIGEST: imageDigest,
    BACKEND_GIT_COMMIT_SHA: commitSha,
    REDDIT_ACCESS_TOKEN: 'reddit-live-value-1234567890',
    REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: lifecyclePath,
    REDDIT_LIVE_EVIDENCE_PATH: liveArtifactPath,
    SOURCE_LIVE_ENVIRONMENT_ID: 'source-reddit-alpha',
    SOURCE_LIVE_OPERATOR: 'source-operator-1',
  }, options);
}

function runRunnerValidateArtifactsSmoke(jobId, env, options = {}) {
  const args = [
    contract.runnerFile,
    '--validate-artifacts',
    '--require-env',
    '--job',
    jobId,
  ];
  if (options.contractSmokeArtifactOnly === true) {
    args.splice(2, 0, '--contract-smoke-artifact-only');
  }

  try {
    execFileSync(
      process.execPath,
      args,
      {
        env: {
          PATH: process.env.PATH ?? '',
          ...env,
        },
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: artifactValidationSmokeTimeoutMs,
      },
    );
    return { exitCode: 0, output: '' };
  } catch (error) {
    return {
      exitCode: typeof error.status === 'number' ? error.status : 1,
      output: childProcessErrorOutput(error),
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
      label: 'world-readable preflight evidence artifact',
      jobId: 'durable-backend-e2e-loop',
      expectedOutput: ['DURABLE_BACKEND_E2E_ARTIFACT_PATH', '0600-style private file permissions before preflight'],
      env: (tempDirectory) => {
        const artifactPath = join(tempDirectory, 'durable-backend-e2e.json');
        writeFileSync(artifactPath, '{}\n', { mode: 0o600 });
        chmodSync(artifactPath, 0o644);
        return durableBackendE2ePreflightEnv(tempDirectory, {
          DURABLE_BACKEND_E2E_ARTIFACT_PATH: artifactPath,
        });
      },
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
        timeout: runnerSmokeTimeoutMs,
      },
    );
    return { exitCode: 0, output: '' };
  } catch (error) {
    return {
      exitCode: typeof error.status === 'number' ? error.status : 1,
      output: childProcessErrorOutput(error),
    };
  }
}

function validateRunnerLocalRuntimePlanSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-local-runtime-plan-'));
  try {
    const env = durableBackendE2ePreflightEnv(tempDirectory, {
      API_BASE_URL: 'http://127.0.0.1:3000',
    });
    const result = runRunnerJsonPlanSmoke(
      'durable-backend-e2e-loop',
      env,
    );
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner local runtime plan smoke must produce a JSON plan: ${smokeOutputSnippet(result.output)}`);
      return;
    }
    const plan = result.plan;
    const job = plan.jobs?.[0];
    if (job?.executionReadiness !== 'blocked_local_runtime_env') {
      violations.push(`${contract.runnerFile}: local Docker runtime evidence must be classified as blocked_local_runtime_env`);
    }
    if (plan.blockedLocalRuntimeEnvJobCount !== 1) {
      violations.push(`${contract.runnerFile}: local runtime plan must count blockedLocalRuntimeEnvJobCount=1`);
    }
    if (plan.readinessCounts?.blocked_local_runtime_env !== 1) {
      violations.push(`${contract.runnerFile}: local runtime plan must include blocked_local_runtime_env readiness count`);
    }
    if (plan.blockedInvalidInputJobCount !== 0) {
      violations.push(`${contract.runnerFile}: local runtime plan must not count local runtime URLs as generic invalid input`);
    }

    const handoffResult = runRunnerTextHandoffSmoke('durable-backend-e2e-loop', env);
    if (handoffResult.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner local runtime handoff smoke must produce text handoff: ${smokeOutputSnippet(handoffResult.output)}`);
      return;
    }
    for (const expectedText of ['Blocked by local runtime env: 1', 'Readiness: blocked_local_runtime_env']) {
      if (!handoffResult.output.includes(expectedText)) {
        violations.push(`${contract.runnerFile}: local runtime handoff smoke must include "${expectedText}"`);
      }
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function validateRunnerDockerBundleAlternativeSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-docker-bundle-alternative-'));
  try {
    const bundlePath = join(tempDirectory, 'backend-staging-evidence-bundle.json');
    writeFileSync(bundlePath, JSON.stringify({
      schemaVersion: 1,
      artifactId: 'backend-staging-evidence-bundle-redacted-smoke',
      provenance: {
        evidenceKind: 'local_docker_staging',
        fixtureOnly: false,
      },
      redaction: {
        secretsIncluded: false,
        rawConnectionUrlsIncluded: false,
      },
    }, null, 2));
    chmodSync(bundlePath, 0o600);

    const cases = [
      {
        jobId: 'durable-runtime-staging-proof',
        coveredEnv: 'API_BASE_URL',
        env: {
          BACKEND_IMAGE_DIGEST: `sha256:${'1'.repeat(64)}`,
          BACKEND_STAGING_EVIDENCE_BUNDLE_PATH: bundlePath,
          DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH: join(tempDirectory, 'durable-runtime-selector.json'),
          STAGING_ENVIRONMENT_ID: 'docker-alpha-1',
        },
      },
      {
        jobId: 'rabbitmq-staging-reliability-drill',
        coveredEnv: 'RABBITMQ_URL',
        env: {
          BACKEND_IMAGE_DIGEST: `sha256:${'2'.repeat(64)}`,
          BACKEND_STAGING_EVIDENCE_BUNDLE_PATH: bundlePath,
          RABBITMQ_STAGING_DRILL_ARTIFACT_PATH: join(tempDirectory, 'rabbitmq-staging-drill.json'),
          STAGING_ENVIRONMENT_ID: 'docker-alpha-1',
        },
      },
      {
        jobId: 'postgres-restore-migration-drill',
        coveredEnv: 'DATABASE_URL',
        env: {
          BACKEND_IMAGE_DIGEST: `sha256:${'3'.repeat(64)}`,
          BACKEND_STAGING_EVIDENCE_BUNDLE_PATH: bundlePath,
          POSTGRES_RESTORE_DRILL_ARTIFACT_PATH: join(tempDirectory, 'postgres-restore-drill.json'),
          STAGING_ENVIRONMENT_ID: 'docker-alpha-1',
        },
      },
      {
        jobId: 'durable-backend-e2e-loop',
        coveredEnv: 'API_BASE_URL',
        env: durableBackendE2ePreflightEnv(tempDirectory, {
          API_BASE_URL: '',
          BACKEND_STAGING_EVIDENCE_BUNDLE_PATH: bundlePath,
          STAGING_ENVIRONMENT_ID: 'docker-alpha-1',
        }),
      },
      {
        jobId: 'release-deploy-smoke',
        coveredEnv: 'API_BASE_URL',
        env: {
          BACKEND_IMAGE_DIGEST: `sha256:${'4'.repeat(64)}`,
          BACKEND_STAGING_EVIDENCE_BUNDLE_PATH: bundlePath,
          RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH: join(tempDirectory, 'release-deploy-smoke.json'),
          STAGING_ENVIRONMENT_ID: 'docker-alpha-1',
        },
      },
    ];

    for (const currentCase of cases) {
      const result = runRunnerJsonPlanSmoke(currentCase.jobId, currentCase.env);
      if (result.exitCode !== 0) {
        violations.push(`${contract.runnerFile}: Docker bundle alternative plan smoke for ${currentCase.jobId} must produce a JSON plan: ${smokeOutputSnippet(result.output)}`);
        continue;
      }
      const job = result.plan.jobs?.[0];
      if (job?.executionReadiness !== 'manual_artifact_required') {
        violations.push(`${contract.runnerFile}: Docker bundle alternative for ${currentCase.jobId} must be manual_artifact_required`);
      }
      if (job?.missingEnv?.includes(currentCase.coveredEnv)) {
        violations.push(`${contract.runnerFile}: Docker bundle alternative for ${currentCase.jobId} must cover ${currentCase.coveredEnv}`);
      }
      if (result.plan.blockedMissingRequiredEnvJobCount !== 0) {
        violations.push(`${contract.runnerFile}: Docker bundle alternative for ${currentCase.jobId} must not count missing required env`);
      }
      if (result.plan.blockedInvalidInputJobCount !== 0) {
        violations.push(`${contract.runnerFile}: Docker bundle alternative for ${currentCase.jobId} must not count invalid input`);
      }
      if (result.plan.blockedLocalRuntimeEnvJobCount !== 0) {
        violations.push(`${contract.runnerFile}: Docker bundle alternative for ${currentCase.jobId} must not count local runtime env`);
      }
    }

    const handoffResult = runRunnerTextHandoffSmoke('durable-backend-e2e-loop', cases[3].env);
    if (handoffResult.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: Docker bundle alternative handoff smoke must produce text handoff: ${smokeOutputSnippet(handoffResult.output)}`);
    } else if (!handoffResult.output.includes('BACKEND_STAGING_EVIDENCE_BUNDLE_PATH covers API_BASE_URL')) {
      violations.push(`${contract.runnerFile}: Docker bundle alternative handoff must explain covered API_BASE_URL`);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function validateRunnerOutputRedactionSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-output-redaction-'));
  try {
    const secrets = outputRedactionSecretValues();
    const env = completeExternalEvidencePreflightEnv(tempDirectory, {
      API_BASE_URL: `http://127.0.0.1:3000?access_token=${secrets.apiToken}`,
      DATABASE_URL: 'postgresql://runtime_user:...@127.0.0.1:54329/social_monitor',
      RABBITMQ_URL: 'amqp://runtime_user:...@127.0.0.1:56729/social_monitor',
      REDDIT_ACCESS_TOKEN: secrets.redditAccessToken,
      REDDIT_CLIENT_SECRET: secrets.redditClientSecret,
      REDDIT_REFRESH_TOKEN: secrets.redditRefreshToken,
    });

    const smokeCommands = [
      { label: 'JSON plan', args: ['--plan', '--json'] },
      { label: 'summary', args: ['--summary'] },
      { label: 'text handoff', args: ['--handoff'] },
      { label: 'JSON handoff', args: ['--handoff-json'] },
    ];

    for (const smokeCommand of smokeCommands) {
      const result = runRunnerOutputSmoke(smokeCommand.args, env);
      if (result.exitCode !== 0) {
        violations.push(`${contract.runnerFile}: runner ${smokeCommand.label} redaction smoke must succeed: ${smokeOutputSnippet(result.output)}`);
        continue;
      }
      assertNoRunnerOutputSecrets(result.output, smokeCommand.label, secrets.forbiddenOutputFragments);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function validateRunnerEnvFileSmokes() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-env-file-'));
  try {
    const envFilePath = join(tempDirectory, 'external-beta-evidence.env');
    writeEnvFile(envFilePath, completeExternalEvidencePreflightEnv(tempDirectory));
    const positiveResult = runRunnerOutputSmoke(['--summary', '--env-file', envFilePath], {});
    if (positiveResult.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner env-file summary smoke must accept private env file: ${smokeOutputSnippet(positiveResult.output)}`);
    } else if (!positiveResult.output.includes('External evidence env readiness: 13/13 live/manual jobs (100%)')) {
      violations.push(`${contract.runnerFile}: runner env-file summary smoke must load required env values`);
    }

    const conflictPath = join(tempDirectory, 'conflicting-external-beta-evidence.env');
    writeEnvFile(conflictPath, {
      BACKEND_IMAGE_DIGEST: `sha256:${'0'.repeat(64)}`,
    });
    const conflictResult = runRunnerOutputSmoke(['--summary', '--env-file', envFilePath, '--env-file', conflictPath], {});
    if (conflictResult.exitCode === 0) {
      violations.push(`${contract.runnerFile}: runner env-file conflict smoke must reject conflicting values`);
    } else if (!conflictResult.output.includes('conflicts with')) {
      violations.push(`${contract.runnerFile}: runner env-file conflict smoke must explain conflicting values`);
    }

    const confirmationPath = join(tempDirectory, 'confirmation-external-beta-evidence.env');
    writeEnvFile(confirmationPath, {
      EXTERNAL_BETA_EVIDENCE_CONFIRM: 'run-live',
    });
    const confirmationResult = runRunnerOutputSmoke(['--summary', '--env-file', confirmationPath], {});
    if (confirmationResult.exitCode === 0) {
      violations.push(`${contract.runnerFile}: runner env-file confirmation smoke must reject live execution confirmation in env file`);
    } else if (!confirmationResult.output.includes('EXTERNAL_BETA_EVIDENCE_CONFIRM must be set explicitly in the operator shell')) {
      violations.push(`${contract.runnerFile}: runner env-file confirmation smoke must explain confirmation shell policy`);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function writeEnvFile(path, env) {
  const lines = Object.entries(env)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([name, value]) => `${name}='${String(value).replaceAll("'", "'\\''")}'`);
  writeFileSync(path, `${lines.join('\n')}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function outputRedactionSecretValues() {
  const values = {
    apiToken: 'runtime-api-token-value-1234567890',
    redditAccessToken: 'reddit-runtime-access-value-1234567890',
    redditClientSecret: 'reddit-runtime-client-secret-value-1234567890',
    redditRefreshToken: 'reddit-runtime-refresh-value-1234567890',
  };
  return {
    ...values,
    forbiddenOutputFragments: [
      values.apiToken,
      values.redditAccessToken,
      values.redditClientSecret,
      values.redditRefreshToken,
      'postgresql://runtime_user:...@127.0.0.1:54329/social_monitor',
      'amqp://runtime_user:...@127.0.0.1:56729/social_monitor',
      '127.0.0.1:54329',
      '127.0.0.1:56729',
    ],
  };
}

function assertNoRunnerOutputSecrets(output, label, forbiddenOutputFragments) {
  for (const fragment of forbiddenOutputFragments) {
    if (String(output).includes(fragment)) {
      violations.push(`${contract.runnerFile}: runner ${label} output must not print raw env value fragment "${fragment}"`);
    }
  }
}

function runRunnerOutputSmoke(args, env) {
  try {
    const output = execFileSync(
      process.execPath,
      [
        contract.runnerFile,
        ...args,
      ],
      {
        env: {
          PATH: process.env.PATH ?? '',
          ...env,
        },
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: runnerSmokeTimeoutMs,
      },
    );
    return { exitCode: 0, output };
  } catch (error) {
    return {
      exitCode: typeof error.status === 'number' ? error.status : 1,
      output: childProcessErrorOutput(error),
    };
  }
}

function runRunnerTextHandoffSmoke(jobId, env) {
  try {
    const output = execFileSync(
      process.execPath,
      [
        contract.runnerFile,
        '--handoff',
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
        timeout: runnerSmokeTimeoutMs,
      },
    );
    return { exitCode: 0, output };
  } catch (error) {
    return {
      exitCode: typeof error.status === 'number' ? error.status : 1,
      output: childProcessErrorOutput(error),
    };
  }
}

function runRunnerJsonPlanSmoke(jobId, env) {
  try {
    const output = execFileSync(
      process.execPath,
      [
        contract.runnerFile,
        '--plan',
        '--json',
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
        timeout: runnerSmokeTimeoutMs,
      },
    );
    return { exitCode: 0, output, plan: JSON.parse(output) };
  } catch (error) {
    return {
      exitCode: typeof error.status === 'number' ? error.status : 1,
      output: childProcessErrorOutput(error),
      plan: undefined,
    };
  }
}

function childProcessErrorOutput(error) {
  const chunks = [
    error.stdout,
    error.stderr,
    ...(Array.isArray(error.output) ? error.output : []),
    error.message,
  ];

  return chunks
    .filter((chunk) => chunk !== undefined && chunk !== null)
    .map((chunk) => Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk))
    .filter((chunk) => chunk.trim().length > 0)
    .join('\n');
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

  const redditTempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-preflight-reddit-refresh-positive-'));
  try {
    const result = runRunnerPreflightPositiveSmoke(redditOAuthPreflightEnv(redditTempDirectory, {
      REDDIT_ACCESS_TOKEN: '',
      REDDIT_CLIENT_ID: 'reddit-client-id-prod-1',
      REDDIT_CLIENT_SECRET: 'reddit-client-secret-value-1234567890',
      REDDIT_REFRESH_TOKEN: 'reddit-refresh-token-value-1234567890',
    }), 'live-reddit-oauth');
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner positive preflight smoke must accept Reddit refresh-token auth alternative: ${smokeOutputSnippet(result.output)}`);
    }
  } finally {
    rmSync(redditTempDirectory, { recursive: true, force: true });
  }

  const redditAppTempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-preflight-reddit-app-refresh-positive-'));
  try {
    const result = runRunnerPreflightPositiveSmoke(redditOAuthPreflightEnv(redditAppTempDirectory, {
      REDDIT_ACCESS_TOKEN: '',
      REDDIT_APP_CLIENT_ID: 'reddit-app-client-id-prod-1',
      REDDIT_APP_CLIENT_SECRET: 'reddit-app-client-secret-value-1234567890',
      REDDIT_REFRESH_TOKEN: 'reddit-refresh-token-value-1234567890',
    }), 'live-reddit-oauth');
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner positive preflight smoke must accept Reddit app refresh-token auth alternative: ${smokeOutputSnippet(result.output)}`);
    }
  } finally {
    rmSync(redditAppTempDirectory, { recursive: true, force: true });
  }
}

function runRunnerPreflightPositiveSmoke(env, jobId) {
  const args = [
    contract.runnerFile,
    '--require-env',
  ];
  if (jobId !== undefined) {
    args.push('--job', jobId);
  }

  try {
    execFileSync(
      process.execPath,
      args,
      {
        env: {
          PATH: process.env.PATH ?? '',
          ...env,
        },
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: runnerSmokeTimeoutMs,
      },
    );
    return { exitCode: 0, output: '' };
  } catch (error) {
    return {
      exitCode: typeof error.status === 'number' ? error.status : 1,
      output: childProcessErrorOutput(error),
    };
  }
}


function smokeOutputSnippet(output) {
  return String(output)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(-8)
    .join(' | ');
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
  for (const requiredSourceJob of requiredSourceLiveCertificationJobIds) {
    if (!sourceJobs.has(requiredSourceJob)) {
      violations.push(`${contractPath}: source live certification must include ${requiredSourceJob}`);
    }
  }
}

function validateJobArtifacts(job, label) {
  if (!Array.isArray(job.outputArtifacts) || job.outputArtifacts.length === 0) {
    violations.push(`${label}: outputArtifacts must be non-empty`);
    return;
  }

  const envNames = new Set([...(Array.isArray(job.requiredEnv) ? job.requiredEnv : []), ...(Array.isArray(job.optionalEnv) ? job.optionalEnv : [])]);
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
  const envNames = new Set([...(Array.isArray(job.requiredEnv) ? job.requiredEnv : []), ...(Array.isArray(job.optionalEnv) ? job.optionalEnv : [])]);
  const requiredEnvNames = requiredJobEnvNames.get(job.jobId) ?? [];
  for (const envName of requiredEnvNames) {
    if (!envNames.has(envName)) {
      violations.push(`${label}: must include required evidence env "${envName}"`);
    }
  }
  const optionalEnvNames = new Set(Array.isArray(job.optionalEnv) ? job.optionalEnv : []);
  const requiredOptionalEnvNames = requiredJobOptionalEnvNames.get(job.jobId) ?? [];
  for (const envName of requiredOptionalEnvNames) {
    if (!optionalEnvNames.has(envName)) {
      violations.push(`${label}: must include optional evidence env "${envName}"`);
    }
  }

  const requiredAlternatives = requiredJobEnvAlternatives.get(job.jobId) ?? [];
  for (const requiredAlternative of requiredAlternatives) {
    const hasAlternative = (Array.isArray(job.requiredEnvAlternatives) ? job.requiredEnvAlternatives : []).some((alternative) => (
      alternative !== null && typeof alternative === 'object' && alternative.label === requiredAlternative.label
      && providerKeysEqual(alternative.env, requiredAlternative.env)
      && providerKeysEqual(alternative.coversEnv ?? alternative.env, requiredAlternative.coversEnv)
      && (alternative.mode ?? null) === (requiredAlternative.mode ?? null)
    ));
    if (!hasAlternative) {
      violations.push(
        `${label}: requiredEnvAlternatives must include "${requiredAlternative.label}" env "${requiredAlternative.env.join(', ')}" covering "${requiredAlternative.coversEnv.join(', ')}"`,
      );
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

function validateWiring() {
  const checkScript = scriptNameFromCommand(contract.checkCommand);
  const planScript = scriptNameFromCommand(contract.planCommand);
  const jsonPlanScript = scriptNameFromCommand(contract.jsonPlanCommand);
  const summaryScript = scriptNameFromCommand(contract.summaryCommand);
  const handoffScript = scriptNameFromCommand(contract.handoffCommand);
  const handoffJsonScript = scriptNameFromCommand(contract.handoffJsonCommand);
  const preflightScript = scriptNameFromCommand(contract.preflightCommand);
  const artifactValidationScript = scriptNameFromCommand(contract.artifactValidationCommand);
  const currentPackageScript = scriptNameFromCommand(contract.currentPackageCommand);
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
    currentPackageScript,
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
  if (packageScripts[currentPackageScript] !== 'node scripts/package-current-external-beta-evidence.mjs') {
    violations.push(`${packagePath}: ${currentPackageScript} must run scripts/package-current-external-beta-evidence.mjs`);
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
    currentPackageScript,
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
  if (evidenceRunner.dockerBundleImportCommand !== contract.dockerBundleImportCommand) {
    violations.push(`${externalReadinessPath}: evidenceRunner.dockerBundleImportCommand must match runner contract`);
  }
  if (evidenceRunner.currentPackageCommand !== contract.currentPackageCommand) {
    violations.push(`${externalReadinessPath}: evidenceRunner.currentPackageCommand must match runner contract`);
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
