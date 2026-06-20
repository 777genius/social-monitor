import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { URL } from 'node:url';
import {
  validateEvidenceArtifactProvenance,
  validateEvidenceProvenanceRequirements,
  validateRealEvidenceIdentityStrings,
} from './lib/evidence-provenance.mjs';

const artifactPath = 'ops/release/release-artifact-evidence.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';
const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
const releaseContract = JSON.parse(readFileSync(releaseContractPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const backendSafe = JSON.parse(readFileSync(backendSafePath, 'utf8'));
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const scripts = packageJson.scripts ?? {};
const verifyScript = String(scripts.verify ?? '');
const backendSafeScripts = new Set(backendSafe.backendScripts ?? []);
const baselineArtifacts = new Set((baseline.trackedArtifacts ?? []).map((item) => item.path));
const hasVerificationScript = (scriptName) =>
  verifyScript.includes(`npm run ${scriptName}`) || backendSafeScripts.has(scriptName);
const violations = [];
const deployArtifactFormat = 'release-deploy-smoke-artifact-v1';
const deployArtifactEvidenceKind = 'staging_deploy';
const releaseDeploySmokeArtifactPath = process.env.RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH?.trim();
const allowedArtifactStatus = new Set(['pending_image_digest_and_deploy_smoke', 'passed']);
const requiredSmokeEvidenceShapeBySmokeId = new Map([
  [
    'api-health',
    [
      ['summary', 'non_empty_string'],
      ['healthStatus', 'success_http_status'],
      ['healthzStatus', 'success_http_status'],
      ['imageDigestMatched', 'boolean_true'],
    ],
  ],
  [
    'openapi-contract',
    [
      ['summary', 'non_empty_string'],
      ['snapshotMatched', 'boolean_true'],
      ['deployedOpenApiSha256', 'sha256_hex'],
      ['committedOpenApiSha256', 'sha256_hex'],
    ],
  ],
  [
    'migration-version',
    [
      ['summary', 'non_empty_string'],
      ['migrationMatched', 'boolean_true'],
      ['deployedMigrationValue', 'non_empty_string'],
      ['releaseMigrationValue', 'non_empty_string'],
    ],
  ],
  [
    'worker-pause-resume',
    [
      ['summary', 'non_empty_string'],
      ['pauseSucceeded', 'boolean_true'],
      ['resumeSucceeded', 'boolean_true'],
      ['duplicateEffectsObserved', 'boolean_false'],
      ['pausedWorkerServices', 'non_empty_string_array'],
    ],
  ],
]);
const forbiddenArtifactFragments = [
  'bearer ',
  'basic ',
  'authorization',
  'x-api-key',
  'access_token',
  'refresh_token',
  'id_token',
  'api_key',
  'apikey',
  'private_key',
  'client_secret',
  'password',
  'postgres://',
  'postgresql://',
  'amqp://',
  'amqps://',
  'github_pat_',
  'ghp_',
  'glpat-',
  'xoxb-',
  'xoxp-',
  'sk-proj-',
  'sk-live-',
  'smk_',
  'whsec_',
];
const forbiddenArtifactValuePatterns = [
  {
    label: 'query credential',
    regex: /\b(?:access_token|refresh_token|id_token|api_key|apikey|client_secret|signature|sig)=([^&\s"']+)/gi,
  },
  {
    label: 'header credential',
    regex: /\b(?:authorization|x-api-key|x-amz-security-token):\s*([^,\s"'}]+)/gi,
  },
  {
    label: 'jwt credential',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
];
const requiredSmokeResultMatchingRules = new Set([
  'artifact commitSha must match the release commit',
  'artifact imageDigest must match imageDigest.value and every passed deploySmokeEvidence entry',
  'artifact migrationVersion must match the release evidence migrationVersion',
  'artifact artifactDigests must match committed OpenAPI, event catalog and Prisma schema hashes',
  'artifact smokeResults must include every deploy smoke declared in the release contract',
  'artifact smokeResults observedAt and artifact sampledAt must use strict ISO-8601 timestamps',
  'artifact smokeResults.evidence must be a smoke-specific redacted object with required fields',
  'artifact JSON must not include tokens, raw headers, raw payloads, DB URLs or broker URLs',
]);

if (artifact.schemaVersion !== 1) {
  violations.push(`${artifactPath}: schemaVersion must be 1`);
}

const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[0-9a-f]{40}$/.test(gitSha)) {
  violations.push(`${artifactPath}: git HEAD must resolve to a full commit SHA`);
}

if (!allowedArtifactStatus.has(artifact.status)) {
  violations.push(`${artifactPath}: status must be pending_image_digest_and_deploy_smoke or passed`);
}

if (releaseContract.artifactEvidence?.requiresImageDigest !== true) {
  violations.push(`${releaseContractPath}: release contract must require image digest`);
}

const migrationVersion = artifact.migrationVersion ?? {};
if (migrationVersion.mode !== 'latest_prisma_migration_directory') {
  violations.push(`${artifactPath}: migrationVersion.mode must be latest_prisma_migration_directory`);
}
if (!existsSync(migrationVersion.path ?? '')) {
  violations.push(`${artifactPath}: migrationVersion.path must exist`);
}

const latestMigration = readdirSync('prisma/migrations', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
  .at(-1);
if (migrationVersion.value !== latestMigration) {
  violations.push(`${artifactPath}: migrationVersion.value must match latest Prisma migration directory`);
}
if (migrationVersion.path !== `prisma/migrations/${latestMigration}/migration.sql`) {
  violations.push(`${artifactPath}: migrationVersion.path must point to latest migration.sql`);
}

if (artifact.imageDigest?.requiredForExternalBeta !== true) {
  violations.push(`${artifactPath}: imageDigest.requiredForExternalBeta must be true`);
}

const imageDigest = artifact.imageDigest?.value;
if (imageDigest !== null && !/^sha256:[0-9a-f]{64}$/.test(String(imageDigest))) {
  violations.push(`${artifactPath}: imageDigest.value must be null or sha256:<64 hex chars>`);
}

if (imageDigest === null && artifact.status !== 'pending_image_digest_and_deploy_smoke') {
  violations.push(`${artifactPath}: missing image digest must keep status pending_image_digest_and_deploy_smoke`);
}

validateDeployArtifactContentSchema();

for (const item of artifact.artifactDigests ?? []) {
  if (item.algorithm !== 'sha256') {
    violations.push(`${artifactPath}: artifact "${item.artifactId}" must use sha256`);
  }
  if (!existsSync(item.path)) {
    violations.push(`${artifactPath}: artifact path does not exist "${item.path}"`);
    continue;
  }
  const digest = createHash('sha256').update(readFileSync(item.path)).digest('hex');
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    violations.push(`${artifactPath}: artifact "${item.artifactId}" must produce sha256 digest`);
  }
  if (item.value !== digest) {
    violations.push(`${artifactPath}: artifact "${item.artifactId}" sha256 value is stale`);
  }
}

const smokeIds = new Set((releaseContract.deploySmokeChecks ?? []).map((smoke) => smoke.smokeId));
validateSmokeEvidenceSchemaMap(smokeIds);
const evidenceSmokeIds = new Set();
let hasPendingDeploySmoke = false;
for (const smoke of artifact.deploySmokeEvidence ?? []) {
  if (evidenceSmokeIds.has(smoke.smokeId)) {
    violations.push(`${artifactPath}: duplicate deploy smoke evidence "${smoke.smokeId}"`);
  }
  evidenceSmokeIds.add(smoke.smokeId);

  if (!smokeIds.has(smoke.smokeId)) {
    violations.push(`${artifactPath}: deploy smoke "${smoke.smokeId}" is not declared in release contract`);
  }
  if (smoke.status !== 'pending_staging_deploy' && smoke.status !== 'passed') {
    violations.push(`${artifactPath}: deploy smoke "${smoke.smokeId}" must be pending_staging_deploy or passed`);
  }
  if (smoke.status === 'pending_staging_deploy') {
    hasPendingDeploySmoke = true;
    for (const field of ['stagingArtifactPath', 'environmentId', 'imageDigest', 'sampledAt']) {
      if (smoke[field] !== null) {
        violations.push(`${artifactPath}: pending deploy smoke "${smoke.smokeId}" must keep ${field}=null`);
      }
    }
  }
  if (smoke.status === 'passed') {
    if (!existsSync(smoke.stagingArtifactPath ?? '')) {
      violations.push(`${artifactPath}: passed deploy smoke "${smoke.smokeId}" must reference stagingArtifactPath`);
    }
    if (typeof smoke.environmentId !== 'string' || smoke.environmentId.trim().length === 0) {
      violations.push(`${artifactPath}: passed deploy smoke "${smoke.smokeId}" must define environmentId`);
    }
    if (!/^sha256:[0-9a-f]{64}$/.test(String(smoke.imageDigest ?? ''))) {
      violations.push(`${artifactPath}: passed deploy smoke "${smoke.smokeId}" must define imageDigest`);
    }
    if (typeof smoke.sampledAt !== 'string' || smoke.sampledAt.trim().length === 0) {
      violations.push(`${artifactPath}: passed deploy smoke "${smoke.smokeId}" must define sampledAt`);
    } else if (!isIsoDateString(smoke.sampledAt)) {
      violations.push(`${artifactPath}: passed deploy smoke "${smoke.smokeId}" sampledAt must be an ISO timestamp`);
    }
    validatePassedDeploySmokeArtifact(smoke, gitSha, migrationVersion, artifact.imageDigest.value);
  }
}

for (const smokeId of smokeIds) {
  if (!evidenceSmokeIds.has(smokeId)) {
    violations.push(`${artifactPath}: missing deploy smoke evidence "${smokeId}"`);
  }
}

validateExampleDeployArtifact();
validateEnvDeploySmokeArtifact(gitSha, migrationVersion);

if (artifact.status === 'passed') {
  if (imageDigest === null) {
    violations.push(`${artifactPath}: passed status requires imageDigest.value`);
  }
  if (hasPendingDeploySmoke) {
    violations.push(`${artifactPath}: passed status requires every deploy smoke to be passed`);
  }
}

function validateDeployArtifactContentSchema() {
  const schema = artifact.deploySmokeArtifactContentSchema;
  if (typeof schema !== 'object' || schema === null) {
    violations.push(`${artifactPath}: deploySmokeArtifactContentSchema is required`);
    return;
  }

  if (schema.schemaVersion !== 1) {
    violations.push(`${artifactPath}: deploySmokeArtifactContentSchema.schemaVersion must be 1`);
  }
  if (schema.format !== deployArtifactFormat) {
    violations.push(`${artifactPath}: deploySmokeArtifactContentSchema.format must be ${deployArtifactFormat}`);
  }
  if (typeof schema.exampleArtifactPath !== 'string' || !existsSync(schema.exampleArtifactPath)) {
    violations.push(`${artifactPath}: deploySmokeArtifactContentSchema.exampleArtifactPath must reference an existing path`);
  }

  const requiredTopLevelFields = new Set(schema.requiredTopLevelFields ?? []);
  for (const field of [
    'schemaVersion',
    'format',
    'artifactId',
    'environmentId',
    'imageDigest',
    'apiBaseUrl',
    'commitSha',
    'migrationVersion',
    'operator',
    'sampledAt',
    'provenance',
    'redaction',
    'artifactDigests',
    'smokeResults',
  ]) {
    if (!requiredTopLevelFields.has(field)) {
      violations.push(`${artifactPath}: deploySmokeArtifactContentSchema.requiredTopLevelFields must include ${field}`);
    }
  }
  validateProvenanceRequirements(schema.provenanceRequirements);
  validateEnvArtifactValidation(schema.envArtifactValidation);

  const redaction = schema.redactionRequirements;
  if (typeof redaction !== 'object' || redaction === null) {
    violations.push(`${artifactPath}: deploySmokeArtifactContentSchema.redactionRequirements is required`);
  } else {
    for (const field of [
      'secretsIncluded',
      'rawHeadersIncluded',
      'rawPayloadsIncluded',
      'databaseUrlsIncluded',
      'brokerUrlsIncluded',
    ]) {
      if (redaction[field] !== false) {
        violations.push(`${artifactPath}: deploySmokeArtifactContentSchema.redactionRequirements.${field} must be false`);
      }
    }
  }

  const smokeResult = schema.smokeResultRequirements;
  if (typeof smokeResult !== 'object' || smokeResult === null) {
    violations.push(`${artifactPath}: deploySmokeArtifactContentSchema.smokeResultRequirements is required`);
  } else {
    if (smokeResult.status !== 'passed') {
      violations.push(`${artifactPath}: deploySmokeArtifactContentSchema.smokeResultRequirements.status must be passed`);
    }
    for (const field of ['smokeId', 'status', 'observedAt', 'evidence']) {
      if (!smokeResult.requiredFields?.includes(field)) {
        violations.push(`${artifactPath}: deploySmokeArtifactContentSchema.smokeResultRequirements.requiredFields must include ${field}`);
      }
    }
    const matchingRules = new Set(smokeResult.matchingRules ?? []);
    for (const rule of requiredSmokeResultMatchingRules) {
      if (!matchingRules.has(rule)) {
        violations.push(`${artifactPath}: deploySmokeArtifactContentSchema.smokeResultRequirements.matchingRules must include "${rule}"`);
      }
    }
  }
}

function validateProvenanceRequirements(requirements) {
  validateEvidenceProvenanceRequirements({
    requirements,
    expectedEvidenceKind: deployArtifactEvidenceKind,
    label: 'deploySmokeArtifactContentSchema.provenanceRequirements',
    sourcePath: artifactPath,
    violations,
  });
}

function validatePassedDeploySmokeArtifact(smoke, gitSha, migrationVersion, releaseImageDigest) {
  if (!existsSync(smoke.stagingArtifactPath ?? '')) {
    return;
  }

  const deployArtifact = readDeployArtifact(
    smoke.stagingArtifactPath,
    `deploy smoke "${smoke.smokeId}" stagingArtifactPath`,
  );
  validateDeployArtifactShape(deployArtifact, {
    label: `deploy smoke "${smoke.smokeId}" stagingArtifactPath`,
    strict: true,
    expectedSmokeId: smoke.smokeId,
    expectedEnvironmentId: smoke.environmentId,
    expectedImageDigest: smoke.imageDigest,
    expectedSampledAt: smoke.sampledAt,
    expectedCommitSha: gitSha,
    expectedMigrationVersion: migrationVersion,
    expectedReleaseImageDigest: releaseImageDigest,
  });
}

function validateExampleDeployArtifact() {
  const examplePath = artifact.deploySmokeArtifactContentSchema?.exampleArtifactPath;
  if (typeof examplePath !== 'string' || !existsSync(examplePath)) {
    return;
  }

  const examples = JSON.parse(readFileSync(examplePath, 'utf8')).examples;
  if (!Array.isArray(examples) || examples.length === 0) {
    violations.push(`${examplePath}: examples must be a non-empty array`);
    return;
  }

  for (const example of examples) {
    validateDeployArtifactShape(example, {
      label: `${examplePath}: example "${example.artifactId ?? '<missing>'}"`,
      strict: false,
      allowFixture: true,
    });
  }
}

function validateDeployArtifactShape(deployArtifact, options) {
  const label = options.label;

  if (deployArtifact.schemaVersion !== 1) {
    violations.push(`${label}: schemaVersion must be 1`);
  }
  if (deployArtifact.format !== deployArtifactFormat) {
    violations.push(`${label}: format must be ${deployArtifactFormat}`);
  }
  for (const field of ['artifactId', 'environmentId', 'imageDigest', 'apiBaseUrl', 'commitSha', 'operator', 'sampledAt']) {
    if (typeof deployArtifact[field] !== 'string' || deployArtifact[field].trim().length === 0) {
      violations.push(`${label}: ${field} must be a non-empty string`);
    }
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(String(deployArtifact.imageDigest ?? ''))) {
    violations.push(`${label}: imageDigest must be immutable sha256 digest`);
  }
  if (!/^[0-9a-f]{40}$/.test(String(deployArtifact.commitSha ?? ''))) {
    violations.push(`${label}: commitSha must be a full 40 character git sha`);
  }
  if (!isHttpUrlWithoutCredentials(deployArtifact.apiBaseUrl)) {
    violations.push(`${label}: apiBaseUrl must be an http(s) URL without credentials`);
  }
  if (!isIsoDateString(deployArtifact.sampledAt)) {
    violations.push(`${label}: sampledAt must be an ISO timestamp`);
  }
  if (options.allowFixture !== true) {
    validateRealEvidenceIdentityStrings({
      source: deployArtifact,
      fields: ['environmentId', 'operator'],
      label,
      violations,
      realEvidenceLabel: 'deploy evidence artifacts',
    });
  }

  validateDeployArtifactProvenance(deployArtifact.provenance, label, { allowFixture: options.allowFixture === true });
  validateDeployArtifactRedaction(deployArtifact, label);
  validateNoSensitiveDeployArtifactLiterals(deployArtifact, label);
  validateDeployArtifactMigration(deployArtifact, label, options);
  validateDeployArtifactDigests(deployArtifact, label, options);
  validateDeployArtifactSmokeResults(deployArtifact, label, options);

  if (options.strict === true) {
    if (deployArtifact.environmentId !== options.expectedEnvironmentId) {
      violations.push(`${label}: environmentId must match deploySmokeEvidence entry`);
    }
    if (deployArtifact.imageDigest !== options.expectedImageDigest) {
      violations.push(`${label}: imageDigest must match deploySmokeEvidence entry`);
    }
    if (deployArtifact.imageDigest !== options.expectedReleaseImageDigest) {
      violations.push(`${label}: imageDigest must match release imageDigest.value`);
    }
    if (deployArtifact.sampledAt !== options.expectedSampledAt) {
      violations.push(`${label}: sampledAt must match deploySmokeEvidence entry`);
    }
    if (deployArtifact.commitSha !== options.expectedCommitSha) {
      violations.push(`${label}: commitSha must match current release commit`);
    }
    if (options.expectedApiBaseUrl !== undefined && deployArtifact.apiBaseUrl !== options.expectedApiBaseUrl) {
      violations.push(`${label}: apiBaseUrl must match API_BASE_URL`);
    }
  }
}

function readDeployArtifact(path, label) {
  const rawContent = readFileSync(path, 'utf8');
  validateNoSensitiveDeployArtifactContent(rawContent, label);
  return JSON.parse(rawContent);
}

function validateDeployArtifactProvenance(provenance, label, options) {
  validateEvidenceArtifactProvenance({
    provenance,
    label,
    expectedEvidenceKind: deployArtifactEvidenceKind,
    allowFixture: options.allowFixture === true,
    violations,
    realEvidenceLabel: 'deploy evidence artifacts',
  });
}

function validateDeployArtifactRedaction(deployArtifact, label) {
  if (typeof deployArtifact.redaction !== 'object' || deployArtifact.redaction === null) {
    violations.push(`${label}: redaction object is required`);
    return;
  }

  for (const field of [
    'secretsIncluded',
    'rawHeadersIncluded',
    'rawPayloadsIncluded',
    'databaseUrlsIncluded',
    'brokerUrlsIncluded',
  ]) {
    if (deployArtifact.redaction[field] !== false) {
      violations.push(`${label}: redaction.${field} must be false`);
    }
  }
}

function validateNoSensitiveDeployArtifactLiterals(deployArtifact, label) {
  validateNoSensitiveDeployArtifactContent(JSON.stringify(deployArtifact), label);
}

function validateNoSensitiveDeployArtifactContent(content, label) {
  const serialized = content.toLowerCase();

  for (const fragment of forbiddenArtifactFragments) {
    if (serialized.includes(fragment)) {
      violations.push(`${label}: artifact must not contain sensitive literal fragment "${fragment}"`);
    }
  }
  validateNoSensitivePatterns(content, `${label}: artifact`);
}

function validateDeployArtifactMigration(deployArtifact, label, options) {
  const migration = deployArtifact.migrationVersion;
  if (typeof migration !== 'object' || migration === null) {
    violations.push(`${label}: migrationVersion object is required`);
    return;
  }

  for (const field of ['value', 'path']) {
    if (typeof migration[field] !== 'string' || migration[field].trim().length === 0) {
      violations.push(`${label}: migrationVersion.${field} must be a non-empty string`);
    }
  }

  if (options.strict === true) {
    if (migration.value !== options.expectedMigrationVersion.value) {
      violations.push(`${label}: migrationVersion.value must match release evidence`);
    }
    if (migration.path !== options.expectedMigrationVersion.path) {
      violations.push(`${label}: migrationVersion.path must match release evidence`);
    }
  }
}

function validateDeployArtifactDigests(deployArtifact, label, options) {
  if (!Array.isArray(deployArtifact.artifactDigests) || deployArtifact.artifactDigests.length === 0) {
    violations.push(`${label}: artifactDigests must be a non-empty array`);
    return;
  }

  const expectedDigests = new Map((artifact.artifactDigests ?? []).map((item) => [item.artifactId, item]));
  const seenDigests = new Set();
  for (const digest of deployArtifact.artifactDigests) {
    if (seenDigests.has(digest.artifactId)) {
      violations.push(`${label}: duplicate artifact digest "${digest.artifactId}"`);
    }
    seenDigests.add(digest.artifactId);

    if (digest.algorithm !== 'sha256') {
      violations.push(`${label}: artifact digest "${digest.artifactId}" must use sha256`);
    }
    if (!/^[0-9a-f]{64}$/.test(String(digest.value ?? ''))) {
      violations.push(`${label}: artifact digest "${digest.artifactId}" must define sha256 value`);
    }

    if (options.strict === true) {
      const expected = expectedDigests.get(digest.artifactId);
      if (expected === undefined) {
        violations.push(`${label}: unexpected artifact digest "${digest.artifactId}"`);
      } else {
        for (const field of ['path', 'value']) {
          if (digest[field] !== expected[field]) {
            violations.push(`${label}: artifact digest "${digest.artifactId}" ${field} must match release evidence`);
          }
        }
      }
    }
  }

  for (const digestId of expectedDigests.keys()) {
    if (!seenDigests.has(digestId)) {
      violations.push(`${label}: missing artifact digest "${digestId}"`);
    }
  }
}

function validateDeployArtifactSmokeResults(deployArtifact, label, options) {
  if (!Array.isArray(deployArtifact.smokeResults) || deployArtifact.smokeResults.length === 0) {
    violations.push(`${label}: smokeResults must be a non-empty array`);
    return;
  }

  const seenSmokeIds = new Set();
  for (const result of deployArtifact.smokeResults) {
    if (seenSmokeIds.has(result.smokeId)) {
      violations.push(`${label}: duplicate smokeResult "${result.smokeId}"`);
    }
    seenSmokeIds.add(result.smokeId);

    if (!smokeIds.has(result.smokeId)) {
      violations.push(`${label}: unsupported smokeResult "${result.smokeId}"`);
    }
    if (result.status !== 'passed') {
      violations.push(`${label}: smokeResult "${result.smokeId}" must have status=passed`);
    }
    if (typeof result.observedAt !== 'string' || result.observedAt.trim().length === 0) {
      violations.push(`${label}: smokeResult "${result.smokeId}" must define observedAt`);
    } else if (!isIsoDateString(result.observedAt)) {
      violations.push(`${label}: smokeResult "${result.smokeId}" observedAt must be an ISO timestamp`);
    }
    if (!isRecord(result.evidence)) {
      violations.push(`${label}: smokeResult "${result.smokeId}" must define evidence object`);
    } else {
      validateSmokeEvidenceShape(label, result);
    }
  }

  for (const smokeId of smokeIds) {
    if (!seenSmokeIds.has(smokeId)) {
      violations.push(`${label}: missing smokeResult "${smokeId}"`);
    }
  }

  if (options.strict === true && options.expectedSmokeId !== undefined && !seenSmokeIds.has(options.expectedSmokeId)) {
    violations.push(`${label}: must include smokeResult "${options.expectedSmokeId}"`);
  }
}

function validateNoSensitivePatterns(content, label) {
  for (const pattern of forbiddenArtifactValuePatterns) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(content)) {
      violations.push(`${label} must not contain sensitive ${pattern.label}`);
    }
    pattern.regex.lastIndex = 0;
  }
}

function validateEnvDeploySmokeArtifact(gitSha, migrationVersion) {
  if (releaseDeploySmokeArtifactPath === undefined || releaseDeploySmokeArtifactPath.length === 0) {
    return;
  }
  if (!existsSync(releaseDeploySmokeArtifactPath)) {
    violations.push('RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH must reference an existing deploy smoke artifact');
    return;
  }

  const environmentId = requireEnvWhenDeployArtifactIsPresent('STAGING_ENVIRONMENT_ID');
  const imageDigest = requireEnvWhenDeployArtifactIsPresent('BACKEND_IMAGE_DIGEST');
  const apiBaseUrl = requireEnvWhenDeployArtifactIsPresent('API_BASE_URL');
  const deployArtifact = readDeployArtifact(
    releaseDeploySmokeArtifactPath,
    `RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH (${releaseDeploySmokeArtifactPath})`,
  );
  validateDeployArtifactShape(deployArtifact, {
    label: `RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH (${releaseDeploySmokeArtifactPath})`,
    strict: true,
    expectedEnvironmentId: environmentId,
    expectedImageDigest: imageDigest,
    expectedSampledAt: deployArtifact.sampledAt,
    expectedCommitSha: gitSha,
    expectedMigrationVersion: migrationVersion,
    expectedReleaseImageDigest: imageDigest,
    expectedApiBaseUrl: apiBaseUrl,
  });
}

function requireEnvWhenDeployArtifactIsPresent(name) {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    violations.push(`RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH requires ${name}`);
    return undefined;
  }

  return value;
}

function validateEnvArtifactValidation(validationRules) {
  if (!Array.isArray(validationRules)) {
    violations.push(`${artifactPath}: deploySmokeArtifactContentSchema.envArtifactValidation must be an array`);
    return;
  }

  const rule = validationRules.find((item) => item?.envVar === 'RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH');
  if (!isRecord(rule)) {
    violations.push(`${artifactPath}: envArtifactValidation must include RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH`);
    return;
  }
  if (rule.format !== deployArtifactFormat) {
    violations.push(`${artifactPath}: RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH format must be ${deployArtifactFormat}`);
  }
  for (const envVar of ['STAGING_ENVIRONMENT_ID', 'BACKEND_IMAGE_DIGEST', 'API_BASE_URL']) {
    if (!rule.requiredEnv?.includes(envVar)) {
      violations.push(`${artifactPath}: RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH requiredEnv must include ${envVar}`);
    }
  }
}

function validateSmokeEvidenceSchemaMap(smokeIds) {
  for (const smokeId of smokeIds) {
    const shape = requiredSmokeEvidenceShapeBySmokeId.get(smokeId);
    if (!Array.isArray(shape) || shape.length === 0) {
      violations.push(`${artifactPath}: missing smoke-specific evidence schema for "${smokeId}"`);
      continue;
    }

    const seenFields = new Set();
    for (const [fieldPath, fieldType] of shape) {
      if (typeof fieldPath !== 'string' || fieldPath.trim().length === 0) {
        violations.push(`${artifactPath}: evidence schema for "${smokeId}" has an empty field path`);
      }
      if (seenFields.has(fieldPath)) {
        violations.push(`${artifactPath}: evidence schema for "${smokeId}" duplicates field "${fieldPath}"`);
      }
      seenFields.add(fieldPath);
      if (!isSupportedEvidenceType(fieldType)) {
        violations.push(`${artifactPath}: evidence schema for "${smokeId}" uses unsupported type "${fieldType}"`);
      }
    }
  }

  for (const smokeId of requiredSmokeEvidenceShapeBySmokeId.keys()) {
    if (!smokeIds.has(smokeId)) {
      violations.push(`${artifactPath}: evidence schema references unsupported smoke "${smokeId}"`);
    }
  }
}

function validateSmokeEvidenceShape(label, result) {
  const shape = requiredSmokeEvidenceShapeBySmokeId.get(result.smokeId);
  if (shape === undefined) {
    violations.push(`${label}: smokeResult "${result.smokeId}" has no evidence schema`);
    return;
  }

  for (const [fieldPath, fieldType] of shape) {
    const value = getPath(result.evidence, fieldPath);
    if (value === undefined) {
      violations.push(`${label}: smokeResult "${result.smokeId}" evidence must include ${fieldPath}`);
      continue;
    }
    if (!matchesEvidenceType(value, fieldType)) {
      violations.push(`${label}: smokeResult "${result.smokeId}" evidence.${fieldPath} must be ${fieldType}`);
    }
  }
}

function getPath(value, path) {
  let current = value;
  for (const segment of path.split('.')) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

function matchesEvidenceType(value, fieldType) {
  switch (fieldType) {
    case 'non_empty_string':
      return typeof value === 'string' && value.trim().length > 0;
    case 'success_http_status':
      return Number.isInteger(value) && value >= 200 && value < 300;
    case 'boolean_true':
      return value === true;
    case 'boolean_false':
      return value === false;
    case 'sha256_hex':
      return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
    case 'non_empty_string_array':
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((item) => typeof item === 'string' && item.trim().length > 0)
      );
    default:
      return false;
  }
}

function isSupportedEvidenceType(fieldType) {
  return new Set([
    'non_empty_string',
    'success_http_status',
    'boolean_true',
    'boolean_false',
    'sha256_hex',
    'non_empty_string_array',
  ]).has(fieldType);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHttpUrlWithoutCredentials(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

function isIsoDateString(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

if (!scripts['check:release-artifact-evidence']) {
  violations.push(`${packagePath}: missing check:release-artifact-evidence`);
}
if (!hasVerificationScript('check:release-artifact-evidence')) {
  violations.push(`${packagePath}: npm run verify or verify:backend must include check:release-artifact-evidence`);
}
if (!baselineArtifacts.has(artifactPath)) {
  violations.push(`${baselinePath}: trackedArtifacts must include ${artifactPath}`);
}
if (!baselineArtifacts.has(artifact.deploySmokeArtifactContentSchema?.exampleArtifactPath)) {
  violations.push(`${baselinePath}: trackedArtifacts must include release deploy smoke example artifact path`);
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log(`Release artifact evidence contract OK (${gitSha.slice(0, 12)})`);
