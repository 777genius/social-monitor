import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const artifactPath = 'ops/release/release-artifact-evidence.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
const releaseContract = JSON.parse(readFileSync(releaseContractPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const backendSafe = JSON.parse(readFileSync(backendSafePath, 'utf8'));
const scripts = packageJson.scripts ?? {};
const verifyScript = String(scripts.verify ?? '');
const backendSafeScripts = new Set(backendSafe.backendScripts ?? []);
const hasVerificationScript = (scriptName) =>
  verifyScript.includes(`npm run ${scriptName}`) || backendSafeScripts.has(scriptName);
const violations = [];

if (artifact.schemaVersion !== 1) {
  violations.push(`${artifactPath}: schemaVersion must be 1`);
}

const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[0-9a-f]{40}$/.test(gitSha)) {
  violations.push(`${artifactPath}: git HEAD must resolve to a full commit SHA`);
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
for (const smoke of artifact.deploySmokeEvidence ?? []) {
  if (!smokeIds.has(smoke.smokeId)) {
    violations.push(`${artifactPath}: deploy smoke "${smoke.smokeId}" is not declared in release contract`);
  }
  if (smoke.status !== 'pending_staging_deploy' && smoke.status !== 'passed') {
    violations.push(`${artifactPath}: deploy smoke "${smoke.smokeId}" must be pending_staging_deploy or passed`);
  }
  if (smoke.status === 'pending_staging_deploy') {
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
  }
}

if (!scripts['check:release-artifact-evidence']) {
  violations.push(`${packagePath}: missing check:release-artifact-evidence`);
}
if (!hasVerificationScript('check:release-artifact-evidence')) {
  violations.push(`${packagePath}: npm run verify or verify:backend must include check:release-artifact-evidence`);
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log(`Release artifact evidence contract OK (${gitSha.slice(0, 12)})`);
