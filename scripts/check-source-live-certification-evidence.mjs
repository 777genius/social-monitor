import { createSourceLiveProviderEvidenceValidator } from './lib/source-live-provider-evidence-validation.mjs';
import { createSourceLiveRedditCredentialPolicy } from './lib/source-live-reddit-credential-policy.mjs';
import { createSourceLiveSmokeScriptContracts } from './lib/source-live-smoke-script-contracts.mjs';
import { createSourceLiveArtifactPathGuardSmokes } from './lib/source-live-artifact-path-guard-smokes.mjs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  validateEvidenceArtifactProvenance,
  validateEvidenceProvenanceRequirements,
  validateRealEvidenceIdentityStrings,
} from './lib/evidence-provenance.mjs';
import {
  getPath,
  matchesEvidenceType,
  isSupportedEvidenceType,
  isRecord,
  isIsoDateString,
} from './lib/source-live-certification-evidence-shape.mjs';
import { validateEnvArtifactValidation } from './lib/source-live-env-artifact-validation.mjs';
import { createSourceCertificationRequirementPolicy } from './lib/source-certification-requirements-policy.mjs';

const evidencePath = 'ops/ingestion/source-live-certification-evidence.json';
const sourceCertificationPath = 'ops/ingestion/source-provider-certification.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const backendOpsPath = 'ops/release/backend-ops-readiness-contract.json';
const externalReadinessPath = 'ops/release/external-beta-readiness-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';
const liveOpenScriptPath = 'scripts/check-live-open-connectors.ts';
const liveOpenCaptureScriptPath = 'scripts/capture-live-open-connectors.mjs';
const redditLiveScriptPath = 'scripts/check-live-reddit-oauth.ts';
const redditLiveCaptureScriptPath = 'scripts/capture-live-reddit-oauth.mjs';
const redditOAuthLocalCallbackScriptPath = 'scripts/reddit-oauth-local-callback.mjs';
const githubRepoRadarLiveScriptPath = 'scripts/check-github-repo-radar-live-smoke.ts';
const githubRepoRadarPrismaLiveE2eScriptPath = 'scripts/check-github-repo-radar-prisma-live-e2e.ts';
const githubTrendingPageLiveScriptPath = 'scripts/check-github-trending-page-live-smoke.ts';
const githubTrendingPageCaptureScriptPath = 'scripts/capture-live-github-trending-page.mjs';
const redditSourceProviderPath = 'libs/ingestion/adapters/source/reddit/reddit-source.provider.ts';
const redditRefreshTokenProviderPath = 'libs/ingestion/adapters/source/reddit/refresh-token-reddit-token-provider.ts';
const liveEvidenceArtifactHelperPath = 'scripts/lib/live-evidence-artifact.ts';
const localTsNodePath = join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'ts-node.cmd' : 'ts-node',
);

const evidence = readJson(evidencePath);
const sourceCertification = readJson(sourceCertificationPath);
const packageJson = readJson(packagePath);
const backendSafe = readJson(backendSafePath);
const releaseContract = readJson(releaseContractPath);
const backendOps = readJson(backendOpsPath);
const externalReadiness = readJson(externalReadinessPath);
const baseline = readJson(baselinePath);
const scripts = packageJson.scripts ?? {};
const violations = [];
const { validateCaptureOutputPathGuards, validateDirectRedditLifecyclePathGuards } = createSourceLiveArtifactPathGuardSmokes({
  violations, liveOpenCaptureScriptPath, githubTrendingPageCaptureScriptPath,
  redditLiveCaptureScriptPath, redditLiveScriptPath, localTsNodePath,
});

const gateScript = 'check:source-live-certification-evidence';
const gateCommand = `npm run ${gateScript}`;
const gateId = 'source-live-certification-evidence';
const liveStatusValues = new Set(['pending_live_evidence', 'passed']);
const liveArtifactFormat = 'source-live-provider-evidence-v1';
const liveArtifactEvidenceKind = 'live_network';
const redditCredentialLifecycleFormat = 'reddit-credential-lifecycle-redacted-v1';
const redditCredentialLifecycleEvidenceKind = 'credential_lifecycle';
const requiredRedditLifecycleOperations = new Set(['create', 'rotate', 'revoke', 'redacted-preview']);
// Keep the legacy validator small by loading its typed provider policy.
const requireSourcePolicy = createRequire(import.meta.url);
requireSourcePolicy('ts-node/register');
const {
  requiredProviderSignals, requiredEvidenceShapeBySignalId, requiredDeferredProviders,
  fixtureOnlyProviders, forbiddenExternalBetaBindingProviders, expectedLiveCommands,
  expectedCertificationRequirementCommands, expectedCertificationArtifactEnvs,
} = requireSourcePolicy('./lib/source-live-provider-policy');

const { validateSourceCertification } = createSourceCertificationRequirementPolicy({
  sourceCertification,
  sourceCertificationPath,
  requiredProviderSignals,
  expectedCertificationRequirementCommands,
  expectedCertificationArtifactEnvs,
  fixtureOnlyProviders,
  evidence,
  violations,
  validateCommand,
});
const forbiddenEvidenceFragments = [
  'authorization',
  'bearer ',
  'basic ',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api_key',
  '://user:',
  'access_token',
  'refresh_token',
  'private_key',
  'client_secret',
  'reddit_access_token',
  'github_token',
  'postgres://',
  'postgresql://',
  'amqp://',
  'amqps://',
  'smk_',
  'whsec_',
];
const requiredRealArtifactGuardFragments = [
  'must not contain example, fixture, synthetic, mock or test markers',
];
const forbiddenRealArtifactMarkerPattern = /(?:^|[-_:.\s])(example|fixture|synthetic|mock|test)(?:$|[-_:.\s])/i;

const { validateLiveSmokeScriptContracts } = createSourceLiveSmokeScriptContracts({
  readFileSync, violations, requiredProviderSignals, liveArtifactFormat,
  liveOpenScriptPath, liveOpenCaptureScriptPath, redditLiveScriptPath, redditLiveCaptureScriptPath,
  redditOAuthLocalCallbackScriptPath, githubRepoRadarLiveScriptPath, githubRepoRadarPrismaLiveE2eScriptPath, githubTrendingPageLiveScriptPath,
  githubTrendingPageCaptureScriptPath, redditSourceProviderPath, redditRefreshTokenProviderPath, liveEvidenceArtifactHelperPath,
});

const {
  validateArtifactRedaction,
  validateRedditCredentialLifecycleArtifact,
} = createSourceLiveRedditCredentialPolicy({
  violations,
  redditCredentialLifecycleFormat,
  redditCredentialLifecycleEvidenceKind,
  requiredRedditLifecycleOperations,
  validateNoRealArtifactFixtureMarkers,
  validateNoSensitiveArtifactLiterals,
});

const { validateLiveProviderEvidence } = createSourceLiveProviderEvidenceValidator({
  evidence,
  evidencePath,
  violations,
  requiredProviderSignals,
  liveStatusValues,
  expectedLiveCommands,
  validateCommand,
  requireExistingPath,
  validatePassedProviderArtifact,
});

if (evidence.schemaVersion !== 1) {
  violations.push(`${evidencePath}: schemaVersion must be 1`);
}

if (evidence.scope !== 'backend-only') {
  violations.push(`${evidencePath}: scope must be backend-only`);
}

if (evidence.frontendPolicy !== 'deferred_contract_only') {
  violations.push(`${evidencePath}: frontendPolicy must keep frontend deferred`);
}

if (!['hold_until_live_provider_evidence', 'passed'].includes(evidence.externalBetaStatus)) {
  violations.push(`${evidencePath}: externalBetaStatus must hold until live provider evidence or be passed`);
}

if (evidence.sourceCertification !== sourceCertificationPath) {
  violations.push(`${evidencePath}: sourceCertification must reference ${sourceCertificationPath}`);
}

validateSourceCertification();
validateLiveSmokeScripts();
validatePassedArtifactContentSchema();
validateSignalEvidenceSchemaMap();
validateLiveProviderEvidence();
validateExampleArtifacts();
validateEnvironmentArtifacts();
validateDeferredProviders();
validateExternalBetaProviderScope();
validateNoSensitiveEvidenceLiterals();
requireWiring();

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Source live certification evidence OK');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readEvidenceArtifact(path, label) {
  const serialized = readFileSync(path, 'utf8');
  validateNoSensitiveArtifactContent(serialized, label);
  return JSON.parse(serialized);
}

function validateLiveSmokeScripts() {
  validateLiveSmokeScriptContracts();
  validateCaptureOutputPathGuards();
  validateDirectRedditLifecyclePathGuards();
}

function validatePassedArtifactContentSchema() {
  const schema = evidence.passedArtifactContentSchema;
  if (typeof schema !== 'object' || schema === null) {
    violations.push(`${evidencePath}: passedArtifactContentSchema is required`);
    return;
  }

  if (schema.schemaVersion !== 1) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.schemaVersion must be 1`);
  }
  if (schema.format !== liveArtifactFormat) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.format must be ${liveArtifactFormat}`);
  }
  requireExistingPath(schema.exampleArtifactPath, 'passedArtifactContentSchema.exampleArtifactPath');

  const requiredTopLevelFields = new Set(schema.requiredTopLevelFields ?? []);
  for (const field of [
    'schemaVersion',
    'format',
    'artifactId',
    'environmentId',
    'imageDigest',
    'commitSha',
    'operator',
    'sampledAt',
    'provenance',
    'redaction',
    'providerResults',
  ]) {
    if (!requiredTopLevelFields.has(field)) {
      violations.push(`${evidencePath}: passedArtifactContentSchema.requiredTopLevelFields must include ${field}`);
    }
  }

  const redaction = schema.redactionRequirements;
  if (typeof redaction !== 'object' || redaction === null) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.redactionRequirements is required`);
  } else {
    for (const field of [
      'secretsIncluded',
      'rawProviderPayloadsIncluded',
      'credentialValuesIncluded',
      'privateNetworkUrlsIncluded',
    ]) {
      if (redaction[field] !== false) {
        violations.push(`${evidencePath}: passedArtifactContentSchema.redactionRequirements.${field} must be false`);
      }
    }
  }

  const signalResult = schema.signalResultRequirements;
  if (typeof signalResult !== 'object' || signalResult === null) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.signalResultRequirements is required`);
  } else {
    if (signalResult.status !== 'passed') {
      violations.push(`${evidencePath}: passedArtifactContentSchema.signalResultRequirements.status must be passed`);
    }
    for (const field of ['signalId', 'status', 'observedAt', 'evidence']) {
      if (!signalResult.requiredFields?.includes(field)) {
        violations.push(`${evidencePath}: passedArtifactContentSchema.signalResultRequirements.requiredFields must include ${field}`);
      }
    }
  }

  validateProvenanceRequirements(schema.provenanceRequirements);
  validateEnvArtifactValidation(schema.envArtifactValidation, {
    evidencePath,
    liveArtifactFormat,
    violations,
  });
  validateRealArtifactGuards(schema.realArtifactGuards, 'passedArtifactContentSchema.realArtifactGuards');
  validateRedditCredentialLifecycleSchema(schema.lifecycleArtifactSchema);
}

function validateProvenanceRequirements(
  requirements,
  label = 'passedArtifactContentSchema.provenanceRequirements',
  expectedEvidenceKind = liveArtifactEvidenceKind,
) {
  validateEvidenceProvenanceRequirements({
    requirements,
    expectedEvidenceKind,
    label,
    sourcePath: evidencePath,
    violations,
  });
}

function validatePassedProviderArtifact(provider) {
  if (typeof provider.stagingArtifactPath !== 'string' || !existsSync(provider.stagingArtifactPath)) {
    return;
  }

  const artifact = readEvidenceArtifact(
    provider.stagingArtifactPath,
    `provider "${provider.providerKey}" stagingArtifactPath`,
  );
  validateLiveProviderArtifact(artifact, {
    label: `provider "${provider.providerKey}" stagingArtifactPath`,
    expectedEnvironmentId: provider.environmentId,
    expectedImageDigest: provider.imageDigest,
    expectedCommitSha: provider.commitSha,
    expectedSampledAt: provider.sampledAt,
    requiredProviders: new Set([provider.providerKey]),
  });
}

function validateExampleArtifacts() {
  const examplePath = evidence.passedArtifactContentSchema?.exampleArtifactPath;
  if (typeof examplePath !== 'string' || !existsSync(examplePath)) {
    return;
  }

  const examples = readJson(examplePath).examples;
  if (!Array.isArray(examples) || examples.length === 0) {
    violations.push(`${examplePath}: examples must be a non-empty array`);
    return;
  }

  const coveredProviders = new Set();
  for (const example of examples) {
    validateLiveProviderArtifact(example, {
      label: `${examplePath}: example "${example.artifactId ?? '<missing>'}"`,
      requiredProviders: undefined,
      allowFixture: true,
    });

    for (const providerResult of example.providerResults ?? []) {
      coveredProviders.add(providerResult.providerKey);
    }
  }

  for (const providerKey of requiredProviderSignals.keys()) {
    if (!coveredProviders.has(providerKey)) {
      violations.push(`${examplePath}: examples must include provider "${providerKey}"`);
    }
  }
}

function validateEnvironmentArtifacts() {
  validateLiveEvidenceEnvArtifact('LIVE_OPEN_CONNECTORS_EVIDENCE_PATH', new Set(['hacker-news', 'rss', 'github-issues']));
  validateLiveEvidenceEnvArtifact('GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH', new Set(['github-repo-radar']));
  validateLiveEvidenceEnvArtifact('REDDIT_LIVE_EVIDENCE_PATH', new Set(['reddit']));
  validateRedditCredentialLifecycleEnvArtifact();
}

function validateLiveEvidenceEnvArtifact(envVar, requiredProviders) {
  const artifactPath = readOptionalEnv(envVar);
  if (artifactPath === undefined) {
    return;
  }
  if (!existsSync(artifactPath)) {
    violations.push(`${envVar}: must reference an existing ${liveArtifactFormat} artifact`);
    return;
  }

  const expectedEnvironmentId = requireEnvWhenArtifactIsPresent(envVar, 'SOURCE_LIVE_ENVIRONMENT_ID');
  const expectedImageDigest = requireEnvWhenArtifactIsPresent(envVar, 'BACKEND_IMAGE_DIGEST');
  const expectedCommitSha = requireEnvWhenArtifactIsPresent(envVar, 'BACKEND_GIT_COMMIT_SHA');
  const expectedOperator = requireEnvWhenArtifactIsPresent(envVar, 'SOURCE_LIVE_OPERATOR');
  const artifact = readEvidenceArtifact(artifactPath, `${envVar} (${artifactPath})`);
  validateLiveProviderArtifact(artifact, {
    label: `${envVar} (${artifactPath})`,
    expectedEnvironmentId,
    expectedImageDigest,
    expectedCommitSha,
    expectedOperator,
    requiredProviders,
  });
}

function validateRedditCredentialLifecycleEnvArtifact() {
  const lifecyclePath = readOptionalEnv('REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH');
  if (lifecyclePath === undefined) {
    return;
  }
  if (!existsSync(lifecyclePath)) {
    violations.push('REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: must reference an existing redacted lifecycle evidence file');
    return;
  }

  const serialized = readFileSync(lifecyclePath, 'utf8');
  const lower = serialized.toLowerCase();
  for (const fragment of forbiddenEvidenceFragments) {
    if (lower.includes(fragment)) {
      violations.push(`REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: lifecycle artifact must not contain "${fragment}"`);
    }
  }

  let lifecycleArtifact;
  try {
    lifecycleArtifact = JSON.parse(serialized);
  } catch {
    violations.push('REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: lifecycle artifact must be JSON');
  }
  if (lifecycleArtifact !== undefined) {
    validateRedditCredentialLifecycleArtifact(lifecycleArtifact, {
      label: `REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH (${lifecyclePath})`,
    });
  }

  const lifecycleSha256 = createHash('sha256').update(serialized).digest('hex');
  const redditLivePath = readOptionalEnv('REDDIT_LIVE_EVIDENCE_PATH');
  if (redditLivePath !== undefined && existsSync(redditLivePath)) {
    const redditArtifact = readEvidenceArtifact(redditLivePath, `REDDIT_LIVE_EVIDENCE_PATH (${redditLivePath})`);
    const lifecycleSignal = findSignalResult(redditArtifact, 'reddit', 'reddit-credential-lifecycle');
    if (lifecycleSignal?.evidence?.lifecycleArtifactSha256 !== lifecycleSha256) {
      violations.push('REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: sha256 must match reddit live evidence lifecycle signal');
    }
  }
}

function findSignalResult(artifact, providerKey, signalId) {
  const provider = (artifact.providerResults ?? []).find((result) => result.providerKey === providerKey);
  return provider?.signalResults?.find((signal) => signal.signalId === signalId);
}

function requireEnvWhenArtifactIsPresent(artifactEnvVar, requiredEnvVar) {
  const value = readOptionalEnv(requiredEnvVar);
  if (value === undefined) {
    violations.push(`${artifactEnvVar}: requires ${requiredEnvVar}`);
  }

  return value;
}

function readOptionalEnv(name) {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function validateLiveProviderArtifact(artifact, options) {
  const label = options.label;

  if (artifact.schemaVersion !== 1) {
    violations.push(`${label}: schemaVersion must be 1`);
  }
  if (artifact.format !== liveArtifactFormat) {
    violations.push(`${label}: format must be ${liveArtifactFormat}`);
  }
  for (const field of ['artifactId', 'environmentId', 'imageDigest', 'commitSha', 'operator', 'sampledAt']) {
    if (typeof artifact[field] !== 'string' || artifact[field].trim().length === 0) {
      violations.push(`${label}: ${field} must be a non-empty string`);
    }
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(String(artifact.imageDigest ?? ''))) {
    violations.push(`${label}: imageDigest must be immutable sha256 digest`);
  }
  if (!/^[0-9a-f]{40}$/.test(String(artifact.commitSha ?? ''))) {
    violations.push(`${label}: commitSha must be a full git commit SHA`);
  }
  if (!isIsoDateString(artifact.sampledAt)) {
    violations.push(`${label}: sampledAt must be an ISO timestamp`);
  }
  if (options.allowFixture !== true) {
    validateRealEvidenceIdentityStrings({
      source: artifact,
      fields: ['environmentId', 'operator'],
      label,
      violations,
      realEvidenceLabel: 'live provider evidence artifacts',
    });
  }
  if (options.expectedEnvironmentId !== undefined && artifact.environmentId !== options.expectedEnvironmentId) {
    violations.push(`${label}: environmentId must match liveProviderEvidence entry`);
  }
  if (options.expectedImageDigest !== undefined && artifact.imageDigest !== options.expectedImageDigest) {
    violations.push(`${label}: imageDigest must match liveProviderEvidence entry`);
  }
  if (options.expectedCommitSha !== undefined && artifact.commitSha !== options.expectedCommitSha) {
    violations.push(`${label}: commitSha must match liveProviderEvidence entry`);
  }
  if (options.expectedSampledAt !== undefined && artifact.sampledAt !== options.expectedSampledAt) {
    violations.push(`${label}: sampledAt must match liveProviderEvidence entry`);
  }
  if (options.expectedOperator !== undefined && artifact.operator !== options.expectedOperator) {
    violations.push(`${label}: operator must match SOURCE_LIVE_OPERATOR`);
  }

  validateArtifactProvenance(artifact.provenance, label, options);
  validateArtifactRedaction(artifact, label);
  if (options.allowFixture !== true) {
    validateNoRealArtifactFixtureMarkers(artifact, label);
  }
  validateNoSensitiveArtifactLiterals(artifact, label);
  validateProviderResults(artifact, options);
}

function validateArtifactProvenance(provenance, label, options) {
  validateEvidenceArtifactProvenance({
    provenance,
    label,
    expectedEvidenceKind: liveArtifactEvidenceKind,
    allowFixture: options.allowFixture === true,
    violations,
    realEvidenceLabel: 'live evidence artifacts',
  });
}

function validateRedditCredentialLifecycleSchema(schema) {
  const label = 'passedArtifactContentSchema.lifecycleArtifactSchema';
  if (!isRecord(schema)) {
    violations.push(`${evidencePath}: ${label} is required`);
    return;
  }
  if (schema.format !== redditCredentialLifecycleFormat) {
    violations.push(`${evidencePath}: ${label}.format must be ${redditCredentialLifecycleFormat}`);
  }
  requireExistingPath(schema.exampleArtifactPath, `${label}.exampleArtifactPath`);
  requireFieldListCoverage(
    schema.requiredTopLevelFields,
    [
      'schemaVersion',
      'format',
      'artifactId',
      'environmentId',
      'imageDigest',
      'commitSha',
      'operator',
      'sampledAt',
      'provenance',
      'redaction',
      'lifecycleOperations',
    ],
    `${label}.requiredTopLevelFields`,
  );
  if (Array.isArray(schema.requiredEnv) && schema.requiredEnv.length > 0) {
    violations.push(`${evidencePath}: ${label}.requiredEnv must be empty because lifecycle grants can predate the current release artifact`);
  }
  requireFieldListCoverage(schema.requiredOperations, [...requiredRedditLifecycleOperations], `${label}.requiredOperations`);
  validateProvenanceRequirements(
    schema.provenanceRequirements,
    `${label}.provenanceRequirements`,
    redditCredentialLifecycleEvidenceKind,
  );
  validateRealArtifactGuards(schema.realArtifactGuards, `${label}.realArtifactGuards`);

  const redaction = schema.redactionRequirements;
  if (!isRecord(redaction)) {
    violations.push(`${evidencePath}: ${label}.redactionRequirements is required`);
  } else {
    for (const field of [
      'secretsIncluded',
      'rawProviderPayloadsIncluded',
      'credentialValuesIncluded',
      'privateNetworkUrlsIncluded',
    ]) {
      if (redaction[field] !== false) {
        violations.push(`${evidencePath}: ${label}.redactionRequirements.${field} must be false`);
      }
    }
  }

  if (typeof schema.exampleArtifactPath === 'string' && existsSync(schema.exampleArtifactPath)) {
    validateRedditCredentialLifecycleArtifact(readJson(schema.exampleArtifactPath), {
      label: `${label}.exampleArtifactPath (${schema.exampleArtifactPath})`,
      allowFixture: true,
    });
  }
}







function validateNoSensitiveArtifactLiterals(artifact, label) {
  validateNoSensitiveArtifactContent(JSON.stringify(artifact), label);
}

function validateNoSensitiveArtifactContent(content, label) {
  const serialized = content.toLowerCase();

  for (const fragment of forbiddenEvidenceFragments) {
    if (serialized.includes(fragment)) {
      violations.push(`${label}: artifact must not contain sensitive literal fragment "${fragment}"`);
    }
  }
}

function validateRealArtifactGuards(guards, label) {
  for (const fragment of requiredRealArtifactGuardFragments) {
    if (!Array.isArray(guards) || !guards.some((guard) => String(guard).includes(fragment))) {
      violations.push(`${evidencePath}: ${label} must include "${fragment}"`);
    }
  }
}

function validateNoRealArtifactFixtureMarkers(value, label, path = []) {
  if (typeof value === 'string') {
    const marker = forbiddenRealArtifactMarkerPattern.exec(value);
    if (marker !== null) {
      const fieldPath = path.length === 0 ? '<root>' : path.join('.');
      violations.push(`${label}: ${fieldPath} must not contain fixture marker "${marker[1]}"`);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      validateNoRealArtifactFixtureMarkers(item, label, [...path, `[${index}]`]);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    validateNoRealArtifactFixtureMarkers(item, label, [...path, key]);
  }
}

function validateProviderResults(artifact, options) {
  if (!Array.isArray(artifact.providerResults) || artifact.providerResults.length === 0) {
    violations.push(`${options.label}: providerResults must be a non-empty array`);
    return;
  }

  const providerResults = new Map();
  for (const result of artifact.providerResults) {
    if (providerResults.has(result.providerKey)) {
      violations.push(`${options.label}: duplicate providerResult "${result.providerKey}"`);
      continue;
    }
    providerResults.set(result.providerKey, result);

    if (!requiredProviderSignals.has(result.providerKey)) {
      violations.push(`${options.label}: unsupported providerResult "${result.providerKey}"`);
      continue;
    }
    if (result.status !== 'passed') {
      violations.push(`${options.label}: providerResult "${result.providerKey}" must have status=passed`);
    }
    validateArtifactProviderFreshnessGuard(result, options.label);
    validateArtifactSignalResults(result, options.label);
  }

  const requiredProviders = options.requiredProviders ?? new Set(providerResults.keys());
  for (const providerKey of requiredProviders) {
    if (!providerResults.has(providerKey)) {
      violations.push(`${options.label}: missing providerResult "${providerKey}"`);
    }
  }
}

function validateArtifactSignalResults(providerResult, label) {
  if (!Array.isArray(providerResult.signalResults) || providerResult.signalResults.length === 0) {
    violations.push(`${label}: providerResult "${providerResult.providerKey}" must define signalResults`);
    return;
  }

  const requiredSignals = requiredProviderSignals.get(providerResult.providerKey) ?? new Set();
  const seenSignals = new Set();
  for (const signal of providerResult.signalResults) {
    if (seenSignals.has(signal.signalId)) {
      violations.push(`${label}: duplicate signalResult "${signal.signalId}" for provider "${providerResult.providerKey}"`);
      continue;
    }
    seenSignals.add(signal.signalId);

    if (!requiredSignals.has(signal.signalId)) {
      violations.push(`${label}: unsupported signalResult "${signal.signalId}" for provider "${providerResult.providerKey}"`);
    }
    if (signal.status !== 'passed') {
      violations.push(`${label}: signalResult "${signal.signalId}" must have status=passed`);
    }
    if (typeof signal.observedAt !== 'string' || signal.observedAt.trim().length === 0) {
      violations.push(`${label}: signalResult "${signal.signalId}" must define observedAt`);
    } else if (!isIsoDateString(signal.observedAt)) {
      violations.push(`${label}: signalResult "${signal.signalId}" observedAt must be an ISO timestamp`);
    }
    if (!isRecord(signal.evidence)) {
      violations.push(`${label}: signalResult "${signal.signalId}" must define evidence object`);
    } else {
      validateSignalEvidenceShape(label, signal);
    }
  }

  for (const signalId of requiredSignals) {
    if (!seenSignals.has(signalId)) {
      violations.push(`${label}: provider "${providerResult.providerKey}" missing signalResult "${signalId}"`);
    }
  }
}

function validateArtifactProviderFreshnessGuard(providerResult, label) {
  const expectedGuard = sourceFreshnessGuardForProvider(providerResult.providerKey);
  const guardLabel = `${label}: providerResult "${providerResult.providerKey}".freshnessGuard`;
  if (!isRecord(providerResult.freshnessGuard)) {
    violations.push(`${guardLabel} must be an object matching source provider certification`);
    return;
  }

  for (const field of [
    'maxStalenessSeconds',
    'minimumScanIntervalSeconds',
    'skipRecentlyScanned',
    'scanHistoryRequired',
    'cursorResumeRequired',
    'rateLimitBackoffRequired',
    'staleReadModelState',
    'providerFailureHealthState',
  ]) {
    if (providerResult.freshnessGuard[field] !== expectedGuard?.[field]) {
      violations.push(`${guardLabel}.${field} must match ${sourceCertificationPath}`);
    }
  }

  if (!Array.isArray(providerResult.freshnessGuard.signals) || providerResult.freshnessGuard.signals.length === 0) {
    violations.push(`${guardLabel}.signals must be a non-empty array`);
    return;
  }
  requireExactStringSet(
    providerResult.freshnessGuard.signals,
    expectedGuard?.signals ?? [],
    `${guardLabel}.signals`,
  );
}

function sourceFreshnessGuardForProvider(providerKey) {
  const provider = [
    ...(sourceCertification.certifiedProviders ?? []),
    ...(sourceCertification.deferredProviders ?? []),
  ].find((candidate) => candidate.providerKey === providerKey);
  if (!isRecord(provider?.freshnessGuard)) {
    violations.push(`${sourceCertificationPath}: provider "${providerKey}" must define freshnessGuard`);
    return undefined;
  }

  return provider.freshnessGuard;
}

function validateDeferredProviders() {
  const deferred = new Map();
  const sourceDeferred = new Map(
    (sourceCertification.deferredProviders ?? []).map((provider) => [provider.providerKey, provider]),
  );

  for (const provider of evidence.deferredProviders ?? []) {
    if (deferred.has(provider.providerKey)) {
      violations.push(`${evidencePath}: duplicate deferred provider "${provider.providerKey}"`);
    }
    deferred.set(provider.providerKey, provider);

    if (!requiredDeferredProviders.has(provider.providerKey)) {
      violations.push(`${evidencePath}: unsupported deferred provider "${provider.providerKey}"`);
    }
    if (provider.status !== 'deferred') {
      violations.push(`${evidencePath}: deferred provider "${provider.providerKey}" must have status=deferred`);
    }
    if (provider.requiredForExternalBeta !== false) {
      violations.push(`${evidencePath}: deferred provider "${provider.providerKey}" must not be required for external beta`);
    }
    if (typeof provider.exitCondition !== 'string' || provider.exitCondition.trim().length === 0) {
      violations.push(`${evidencePath}: deferred provider "${provider.providerKey}" must define exitCondition`);
    }

    const sourceProvider = sourceDeferred.get(provider.providerKey);
    if (sourceProvider === undefined) {
      violations.push(`${sourceCertificationPath}: missing deferred provider "${provider.providerKey}"`);
    } else if (sourceProvider.runtimeReadiness !== 'deferred') {
      violations.push(`${sourceCertificationPath}: deferred provider "${provider.providerKey}" must have runtimeReadiness=deferred`);
    }
  }

  for (const providerKey of requiredDeferredProviders) {
    if (!deferred.has(providerKey)) {
      violations.push(`${evidencePath}: missing deferred provider "${providerKey}"`);
    }
  }
}

function validateExternalBetaProviderScope() {
  const scope = evidence.externalBetaProviderScope;
  if (!isRecord(scope)) {
    violations.push(`${evidencePath}: externalBetaProviderScope is required`);
    return;
  }

  requireExactStringSet(
    scope.requiredLiveProviders,
    requiredProviderSignals.keys(),
    'externalBetaProviderScope.requiredLiveProviders',
  );
  requireExactStringSet(
    scope.forbiddenBindingProviders,
    forbiddenExternalBetaBindingProviders,
    'externalBetaProviderScope.forbiddenBindingProviders',
  );
  requireExactStringSet(
    scope.fixtureOnlyProviders,
    fixtureOnlyProviders,
    'externalBetaProviderScope.fixtureOnlyProviders',
  );

  const liveProviders = new Set((evidence.liveProviderEvidence ?? []).map((provider) => provider.providerKey));
  for (const providerKey of forbiddenExternalBetaBindingProviders) {
    if (liveProviders.has(providerKey)) {
      violations.push(`${evidencePath}: forbidden provider "${providerKey}" must not appear in liveProviderEvidence`);
    }
  }
}

function validateNoSensitiveEvidenceLiterals() {
  const serialized = JSON.stringify(evidence).toLowerCase();

  for (const fragment of forbiddenEvidenceFragments) {
    if (serialized.includes(fragment)) {
      violations.push(`${evidencePath}: evidence must not contain sensitive literal fragment "${fragment}"`);
    }
  }
}

function validateSignalEvidenceSchemaMap() {
  const requiredSignalIds = new Set([...requiredProviderSignals.values()].flatMap((signals) => [...signals]));

  for (const signalId of requiredSignalIds) {
    const shape = requiredEvidenceShapeBySignalId.get(signalId);
    if (!Array.isArray(shape) || shape.length === 0) {
      violations.push(`${evidencePath}: missing signal-specific evidence schema for "${signalId}"`);
      continue;
    }

    const seenFields = new Set();
    for (const [fieldPath, fieldType] of shape) {
      if (typeof fieldPath !== 'string' || fieldPath.trim().length === 0) {
        violations.push(`${evidencePath}: evidence schema for "${signalId}" has an empty field path`);
      }
      if (seenFields.has(fieldPath)) {
        violations.push(`${evidencePath}: evidence schema for "${signalId}" duplicates field "${fieldPath}"`);
      }
      seenFields.add(fieldPath);
      if (!isSupportedEvidenceType(fieldType)) {
        violations.push(`${evidencePath}: evidence schema for "${signalId}" uses unsupported type "${fieldType}"`);
      }
    }
  }

  for (const signalId of requiredEvidenceShapeBySignalId.keys()) {
    if (!requiredSignalIds.has(signalId)) {
      violations.push(`${evidencePath}: evidence schema references unsupported signal "${signalId}"`);
    }
  }
}

function requireExactStringSet(actualValues, expectedValues, label) {
  const actual = new Set(actualValues ?? []);
  const expected = new Set(expectedValues);

  for (const value of expected) {
    if (!actual.has(value)) {
      violations.push(`${evidencePath}: ${label} must include ${value}`);
    }
  }

  for (const value of actual) {
    if (!expected.has(value)) {
      violations.push(`${evidencePath}: ${label} must not include ${value}`);
    }
  }
}

function requireFieldListCoverage(actualValues, expectedValues, label) {
  const actual = new Set(actualValues ?? []);
  for (const value of expectedValues) {
    if (!actual.has(value)) {
      violations.push(`${evidencePath}: ${label} must include ${value}`);
    }
  }
}

function validateSignalEvidenceShape(label, signal) {
  const shape = requiredEvidenceShapeBySignalId.get(signal.signalId);
  if (shape === undefined) {
    violations.push(`${label}: signalResult "${signal.signalId}" has no evidence schema`);
    return;
  }

  for (const [fieldPath, fieldType] of shape) {
    const value = getPath(signal.evidence, fieldPath);
    if (value === undefined) {
      violations.push(`${label}: signalResult "${signal.signalId}" evidence must include ${fieldPath}`);
      continue;
    }
    if (!matchesEvidenceType(value, fieldType)) {
      violations.push(`${label}: signalResult "${signal.signalId}" evidence.${fieldPath} must be ${fieldType}`);
    }
  }
}

function validateCommand(command, label) {
  const scriptName = String(command ?? '').replace(/^npm run /, '');
  if (!String(command ?? '').startsWith('npm run ')) {
    violations.push(`${evidencePath}: ${label} must use npm run`);
    return;
  }
  if (!scripts[scriptName]) {
    violations.push(`${evidencePath}: ${label} references missing npm script "${scriptName}"`);
  }
}

function requireExistingPath(path, label) {
  if (typeof path !== 'string' || path.trim().length === 0 || !existsSync(path)) {
    violations.push(`${evidencePath}: ${label} must reference an existing path`);
  }
}

function requireWiring() {
  const backendScripts = new Set(backendSafe.backendScripts ?? []);
  const releaseGateIds = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.gateId));
  const releaseGateCommands = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.command));
  const sourceDomain = (backendOps.requiredDomains ?? []).find((domain) => domain.domainId === 'source-scope');
  const externalGroup = (externalReadiness.requiredEvidenceGroups ?? []).find(
    (group) => group.groupId === 'source-provider-live-certification',
  );
  const baselineScripts = new Set(baseline.requiredGreenScripts ?? []);
  const baselineArtifacts = new Set((baseline.trackedArtifacts ?? []).map((artifact) => artifact.path));

  if (!scripts[gateScript]) {
    violations.push(`${packagePath}: missing ${gateScript}`);
  }
  if (!backendScripts.has(gateScript)) {
    violations.push(`${backendSafePath}: backend-safe verify must include ${gateScript}`);
  }
  if (!releaseGateIds.has(gateId)) {
    violations.push(`${releaseContractPath}: missing ${gateId} release gate`);
  }
  if (!releaseGateCommands.has(gateCommand)) {
    violations.push(`${releaseContractPath}: release gates must include ${gateScript}`);
  }

  if (sourceDomain === undefined) {
    violations.push(`${backendOpsPath}: missing source-scope domain`);
  } else {
    if (!sourceDomain.gates?.includes(gateScript)) {
      violations.push(`${backendOpsPath}: source-scope domain must include ${gateScript}`);
    }
    if (!sourceDomain.releaseGateIds?.includes(gateId)) {
      violations.push(`${backendOpsPath}: source-scope domain must include ${gateId}`);
    }
    if (!sourceDomain.artifacts?.includes(evidencePath)) {
      violations.push(`${backendOpsPath}: source-scope domain must include ${evidencePath}`);
    }
  }

  if (externalGroup === undefined) {
    violations.push(`${externalReadinessPath}: missing source-provider-live-certification group`);
  } else {
    if (!externalGroup.verificationCommands?.includes(gateCommand)) {
      violations.push(`${externalReadinessPath}: source-provider-live-certification group must include ${gateScript}`);
    }
    if (!externalGroup.requiredArtifacts?.includes(evidencePath)) {
      violations.push(`${externalReadinessPath}: source-provider-live-certification group must include ${evidencePath}`);
    }
    if (externalGroup.status !== 'blocked_without_live_credentials' && evidence.externalBetaStatus !== 'passed') {
      violations.push(`${externalReadinessPath}: source provider group must stay blocked until live evidence passes`);
    }
  }

  if (!baselineScripts.has(gateScript)) {
    violations.push(`${baselinePath}: requiredGreenScripts must include ${gateScript}`);
  }
  if (!baselineArtifacts.has(evidencePath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include ${evidencePath}`);
  }
  if (!baselineArtifacts.has(evidence.passedArtifactContentSchema?.exampleArtifactPath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include source live certification example artifact path`);
  }
}
