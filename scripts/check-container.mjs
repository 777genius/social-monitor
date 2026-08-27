import { existsSync, lstatSync, readFileSync } from 'node:fs';

const policyPath = 'ops/security/container-release-policy.json';
const packagePath = 'package.json';
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const pullRequestWorkflow = readFileSync('.github/workflows/pull-request.yml', 'utf8');
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

const instructions = dockerInstructions(dockerfile);
const compiledBuildIndex = instructions.findIndex(({ opcode, arguments: args }) =>
  opcode === 'RUN' && args.includes('npm run build'));
const scriptsCopies = instructions
  .map((instruction, index) => ({ ...instruction, index }))
  .filter(({ opcode, arguments: args }) =>
    opcode === 'COPY' && args.replaceAll(/\s+/gu, ' ').trim() === 'scripts ./scripts');
const runtimeUserIndex = instructions.findIndex(({ opcode, arguments: args }) =>
  opcode === 'USER' && args === 'node');
if (scriptsCopies.length !== 1 || compiledBuildIndex === -1 ||
    scriptsCopies[0].index <= compiledBuildIndex ||
    runtimeUserIndex === -1 || scriptsCopies[0].index >= runtimeUserIndex) {
  violations.push(
    `${policy.dockerfile}: scripts must be copied exactly once after compilation and before USER node`,
  );
}

const recoveryPath = 'scripts/check-feed-promotion-index-recovery.ts';
if (!existsSync(recoveryPath) || !lstatSync(recoveryPath).isFile() ||
    (lstatSync(recoveryPath).mode & 0o444) === 0) {
  violations.push(`${recoveryPath}: migration recovery source must be a readable regular file`);
}
const dockerignoreRules = dockerignore.split(/\r?\n/u)
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith('!'));
if (dockerignoreRules.some((rule) => [
  'scripts', 'scripts/', 'scripts/**', '**/scripts/**', recoveryPath,
].includes(rule))) {
  violations.push(`${policy.dockerignore}: migration scripts must remain in the Docker build context`);
}

for (const dependency of ['ts-node', 'tsconfig-paths', 'typescript']) {
  if (!packageJson.devDependencies?.[dependency]) {
    violations.push(`${packagePath}: image runtime requires devDependency ${dependency}`);
  }
}
if (!packageJson.dependencies?.pg) {
  violations.push(`${packagePath}: image runtime requires dependency pg`);
}
if (packageJson.scripts?.['check:migration-image-runtime'] !==
    'node scripts/check-migration-image-runtime.mjs') {
  violations.push(`${packagePath}: migration image runtime smoke command is missing`);
}
if (!pullRequestWorkflow.includes('npm run check:migration-image-runtime')) {
  violations.push('.github/workflows/pull-request.yml: migration image runtime smoke is not wired into CI');
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

function dockerInstructions(source) {
  const instructions = [];
  let continued = '';
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    continued += `${continued === '' ? '' : ' '}${line.replace(/\\$/u, '').trim()}`;
    if (line.endsWith('\\')) continue;
    const match = continued.match(/^([A-Z]+)\s+([\s\S]+)$/iu);
    if (match) {
      instructions.push({ opcode: match[1].toUpperCase(), arguments: match[2].trim() });
    }
    continued = '';
  }
  return instructions;
}
