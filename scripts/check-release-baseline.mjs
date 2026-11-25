import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const contractPath = 'ops/release/release-baseline-contract.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const packagePath = 'package.json';
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const backendSafe = JSON.parse(readFileSync(backendSafePath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const scripts = packageJson.scripts ?? {};
const backendScripts = new Set(backendSafe.backendScripts ?? []);
const violations = [];

if (contract.schemaVersion !== 1) {
  violations.push(`${contractPath}: schemaVersion must be 1`);
}

if (contract.scope !== 'backend-only') {
  violations.push(`${contractPath}: scope must be backend-only`);
}

if (contract.commitShaMode !== 'computed_at_verification_time') {
  violations.push(`${contractPath}: commitShaMode must be computed_at_verification_time`);
}

const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[0-9a-f]{40}$/.test(gitSha)) {
  violations.push(`${contractPath}: git HEAD must resolve to a full commit SHA`);
}

for (const scriptName of contract.requiredGreenScripts ?? []) {
  if (!scripts[scriptName]) {
    violations.push(`${contractPath}: requiredGreenScripts references missing npm script "${scriptName}"`);
  }
  if (!backendScripts.has(scriptName)) {
    violations.push(`${backendSafePath}: backend-safe verify must include release baseline script "${scriptName}"`);
  }
}

const artifactIds = new Set();
for (const artifact of contract.trackedArtifacts ?? []) {
  if (artifactIds.has(artifact.artifactId)) {
    violations.push(`${contractPath}: duplicate tracked artifact "${artifact.artifactId}"`);
  }
  artifactIds.add(artifact.artifactId);

  if (!existsSync(artifact.path)) {
    violations.push(`${contractPath}: tracked artifact "${artifact.path}" must exist`);
    continue;
  }

  const digest = createHash(contract.artifactDigestAlgorithm).update(readFileSync(artifact.path)).digest('hex');
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    violations.push(`${contractPath}: tracked artifact "${artifact.artifactId}" must produce a sha256 digest`);
  }
}

if (!backendScripts.has('check:release-baseline')) {
  violations.push(`${backendSafePath}: backend-safe verify must include check:release-baseline`);
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log(`Release baseline contract OK (${gitSha.slice(0, 12)})`);
