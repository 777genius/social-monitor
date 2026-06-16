import { existsSync, readFileSync } from 'node:fs';

const policyPath = 'ops/security/container-release-policy.json';
const packagePath = 'package.json';
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const violations = [];

if (policy.schemaVersion !== 1) {
  violations.push(`${policyPath}: schemaVersion must be 1`);
}

if (!policy.dockerfile || !existsSync(policy.dockerfile)) {
  violations.push(`${policyPath}: dockerfile must reference an existing Dockerfile`);
}

if (!policy.dockerignore || !existsSync(policy.dockerignore)) {
  violations.push(`${policyPath}: dockerignore must reference an existing .dockerignore`);
}

const dockerfile = policy.dockerfile && existsSync(policy.dockerfile) ? readFileSync(policy.dockerfile, 'utf8') : '';
const dockerignore = policy.dockerignore && existsSync(policy.dockerignore) ? readFileSync(policy.dockerignore, 'utf8') : '';

if (/FROM\s+.*:latest\b/i.test(dockerfile)) {
  violations.push(`${policy.dockerfile}: base image must not use latest tag`);
}

for (const required of ['FROM node:22', 'npm ci', 'npm run prisma:generate', 'npm run build', 'ARG SERVICE=', 'USER node']) {
  if (!dockerfile.includes(required)) {
    violations.push(`${policy.dockerfile}: missing required container build/runtime marker "${required}"`);
  }
}

const npmCiIndex = dockerfile.indexOf('RUN npm ci');
const nodeEnvIndex = dockerfile.indexOf('ENV NODE_ENV=production');
const buildIndex = dockerfile.indexOf('npm run build');
if (npmCiIndex === -1 || nodeEnvIndex === -1 || buildIndex === -1) {
  violations.push(`${policy.dockerfile}: must install, build, then set production NODE_ENV`);
} else if (nodeEnvIndex < npmCiIndex || nodeEnvIndex < buildIndex) {
  violations.push(
    `${policy.dockerfile}: NODE_ENV=production must be set after npm ci/build because MVP runtime uses ts-node and Prisma CLI`,
  );
}

for (const ignored of ['.git', 'node_modules', 'dist', 'coverage']) {
  if (!dockerignore.split(/\r?\n/).includes(ignored)) {
    violations.push(`${policy.dockerignore}: must ignore ${ignored}`);
  }
}

for (const service of policy.supportedServices ?? []) {
  const scriptName = `start:${service}`;
  if (!packageJson.scripts?.[scriptName]) {
    violations.push(`${policyPath}: supported service "${service}" references missing npm script "${scriptName}"`);
  }
}

for (const [field, required] of Object.entries(policy.requiredEvidence ?? {})) {
  if (required !== true) {
    violations.push(`${policyPath}: requiredEvidence.${field} must be true`);
  }
}

if (!policy.releaseEvidenceContract || !existsSync(policy.releaseEvidenceContract)) {
  violations.push(`${policyPath}: releaseEvidenceContract must reference an existing contract`);
}

if (typeof policy.notes !== 'string' || !policy.notes.includes('MVP image')) {
  violations.push(`${policyPath}: notes must document the current MVP image limitation`);
}

if (!String(packageJson.scripts?.verify ?? '').includes('check:container')) {
  violations.push(`${packagePath}: npm run verify must include check:container`);
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Container release contract OK');
