import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

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
const allowedArtifactStatus = new Set(['pending_image_digest_and_deploy_smoke', 'passed']);
const forbiddenArtifactFragments = [
  'bearer ',
  'basic ',
  'access_token',
  'refresh_token',
  'private_key',
  'client_secret',
  'postgres://',
  'postgresql://',
  'amqp://',
  'amqps://',
  'smk_',
  'whsec_',
];

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
    'commitSha',
    'migrationVersion',
    'operator',
    'sampledAt',
    'redaction',
    'artifactDigests',
    'smokeResults',
  ]) {
    if (!requiredTopLevelFields.has(field)) {
      violations.push(`${artifactPath}: deploySmokeArtifactContentSchema.requiredTopLevelFields must include ${field}`);
    }
  }

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
  }
}

function validatePassedDeploySmokeArtifact(smoke, gitSha, migrationVersion, releaseImageDigest) {
  if (!existsSync(smoke.stagingArtifactPath ?? '')) {
    return;
  }

  const deployArtifact = JSON.parse(readFileSync(smoke.stagingArtifactPath, 'utf8'));
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
  for (const field of ['artifactId', 'environmentId', 'imageDigest', 'commitSha', 'operator', 'sampledAt']) {
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
  }
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
  const serialized = JSON.stringify(deployArtifact).toLowerCase();

  for (const fragment of forbiddenArtifactFragments) {
    if (serialized.includes(fragment)) {
      violations.push(`${label}: artifact must not contain sensitive literal fragment "${fragment}"`);
    }
  }
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
    for (const field of ['observedAt', 'evidence']) {
      if (typeof result[field] !== 'string' || result[field].trim().length === 0) {
        violations.push(`${label}: smokeResult "${result.smokeId}" must define ${field}`);
      }
    }
  }

  for (const smokeId of smokeIds) {
    if (!seenSmokeIds.has(smokeId)) {
      violations.push(`${label}: missing smokeResult "${smokeId}"`);
    }
  }

  if (options.strict === true && !seenSmokeIds.has(options.expectedSmokeId)) {
    violations.push(`${label}: must include smokeResult "${options.expectedSmokeId}"`);
  }
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
