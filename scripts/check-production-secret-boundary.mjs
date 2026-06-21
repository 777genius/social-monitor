import { existsSync, readFileSync } from 'node:fs';

const contractPath = 'ops/release/production-secret-boundary.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';
const backendOpsPath = 'ops/release/backend-ops-readiness-contract.json';
const evidenceRunnerPath = 'ops/release/external-beta-evidence-runner.json';

const contract = readJson(contractPath);
const packageJson = readJson(packagePath);
const backendSafe = readJson(backendSafePath);
const releaseContract = readJson(releaseContractPath);
const baseline = readJson(baselinePath);
const backendOps = readJson(backendOpsPath);
const evidenceRunner = readJson(evidenceRunnerPath);
const scripts = packageJson.scripts ?? {};
const violations = [];

const gateScript = 'check:production-secret-boundary';
const gateCommand = `npm run ${gateScript}`;
const gateId = 'production-secret-boundary';
const requiredSecretClasses = new Set([
  'postgres-credentials',
  'rabbitmq-credentials',
  'oidc-config',
  'oidc-test-token',
]);
const requiredDeployMetadata = new Set([
  'DEPLOYMENT_ID',
  'BACKEND_IMAGE_DIGEST',
  'BACKEND_GIT_COMMIT_SHA',
  'RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH',
  'BACKUP_OBJECT_URI',
]);

validateContractShape();
validateSecretReferences();
validateDeployMetadata();
validateEvidenceEnvExample();
validateLocalOnlyBoundaries();
validateEvidenceRunnerInputs();
validateWiring();

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Production secret boundary contract OK');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function validateContractShape() {
  if (contract.schemaVersion !== 1) {
    violations.push(`${contractPath}: schemaVersion must be 1`);
  }
  if (contract.scope !== 'backend-only') {
    violations.push(`${contractPath}: scope must be backend-only`);
  }
  if (contract.frontendPolicy !== 'deferred_contract_only') {
    violations.push(`${contractPath}: frontendPolicy must keep frontend deferred`);
  }
  if (contract.checkCommand !== gateCommand) {
    violations.push(`${contractPath}: checkCommand must be ${gateCommand}`);
  }
  if (contract.releaseGateId !== gateId) {
    violations.push(`${contractPath}: releaseGateId must be ${gateId}`);
  }
  for (const profile of ['beta', 'staging', 'production']) {
    if (!contract.productionProfiles?.includes(profile)) {
      violations.push(`${contractPath}: productionProfiles must include ${profile}`);
    }
  }
  if (!existsSync(contract.operatorEvidenceEnvExample ?? '')) {
    violations.push(`${contractPath}: operatorEvidenceEnvExample must exist`);
  }
}

function validateSecretReferences() {
  const observedClasses = new Set();
  for (const ref of contract.secretReferences ?? []) {
    observedClasses.add(ref.secretClass);
    for (const field of ['secretClass', 'rawEnv', 'secretRefEnv']) {
      if (typeof ref[field] !== 'string' || ref[field].trim().length === 0) {
        violations.push(`${contractPath}: secretReferences entry must define ${field}`);
      }
    }
    if (ref.committedPlaintextAllowed !== false) {
      violations.push(`${contractPath}: ${ref.secretClass}.committedPlaintextAllowed must be false`);
    }
    for (const profile of ref.requiredForProfiles ?? []) {
      if (!contract.productionProfiles?.includes(profile)) {
        violations.push(`${contractPath}: ${ref.secretClass} references unsupported profile ${profile}`);
      }
    }
  }
  for (const requiredClass of requiredSecretClasses) {
    if (!observedClasses.has(requiredClass)) {
      violations.push(`${contractPath}: secretReferences missing ${requiredClass}`);
    }
  }
}

function validateDeployMetadata() {
  const observedEnv = new Set();
  for (const item of contract.deployMetadata ?? []) {
    observedEnv.add(item.env);
    if (typeof item.env !== 'string' || item.env.trim().length === 0) {
      violations.push(`${contractPath}: deployMetadata entry must define env`);
    }
    if (item.committedPlaintextAllowed !== false) {
      violations.push(`${contractPath}: deployMetadata ${item.env} committedPlaintextAllowed must be false`);
    }
  }
  for (const requiredEnv of requiredDeployMetadata) {
    if (!observedEnv.has(requiredEnv)) {
      violations.push(`${contractPath}: deployMetadata missing ${requiredEnv}`);
    }
  }
}

function validateEvidenceEnvExample() {
  const examplePath = contract.operatorEvidenceEnvExample;
  if (!existsSync(examplePath)) {
    return;
  }
  const env = parseEnvExample(readFileSync(examplePath, 'utf8'));
  const requiredSecretEnv = (contract.secretReferences ?? []).flatMap((ref) => {
    const names = [ref.secretRefEnv];
    if (ref.operatorEvidenceRawEnvRequired !== false) {
      names.push(ref.rawEnv);
    }
    return names;
  });
  const requiredEmptyEnv = new Set([
    ...requiredSecretEnv,
    ...contract.deployMetadata.map((item) => item.env),
    ...(contract.publicAuthMetadata ?? []),
  ]);

  for (const envName of requiredEmptyEnv) {
    if (!env.has(envName)) {
      violations.push(`${examplePath}: missing ${envName}`);
      continue;
    }
    if ((env.get(envName) ?? '').trim().length > 0) {
      violations.push(`${examplePath}: ${envName} must stay empty in git`);
    }
  }

  const body = readFileSync(examplePath, 'utf8');
  assertNoForbiddenCommittedValues(body, examplePath, {
    allowLocalOnlyCredentialUrls: false,
  });
}

function validateLocalOnlyBoundaries() {
  const localOnlyFiles = new Set(contract.allowedLocalOnlyEnvFiles ?? []);
  for (const path of localOnlyFiles) {
    if (!existsSync(path)) {
      violations.push(`${contractPath}: allowedLocalOnlyEnvFiles missing ${path}`);
      continue;
    }
    const body = readFileSync(path, 'utf8');
    assertNoForbiddenCommittedValues(body, path, {
      allowLocalOnlyCredentialUrls: true,
    });
  }

  const envExample = existsSync('.env.example') ? readFileSync('.env.example', 'utf8') : '';
  if (!envExample.includes('SOCIAL_MONITOR_RUNTIME_PROFILE=local-dev')) {
    violations.push('.env.example: local raw service URLs must stay scoped to SOCIAL_MONITOR_RUNTIME_PROFILE=local-dev');
  }
}

function validateEvidenceRunnerInputs() {
  const optionalEnvNames = new Set((evidenceRunner.jobs ?? []).flatMap((job) => job.optionalEnv ?? []));
  for (const ref of contract.secretReferences ?? []) {
    if (!optionalEnvNames.has(ref.secretRefEnv)) {
      violations.push(`${evidenceRunnerPath}: optionalEnv must include ${ref.secretRefEnv}`);
    }
  }
  for (const item of contract.deployMetadata ?? []) {
    if (!optionalEnvNames.has(item.env) && !requiredRunnerEnvNames().has(item.env)) {
      violations.push(`${evidenceRunnerPath}: evidence runner must reference ${item.env}`);
    }
  }
}

function validateWiring() {
  const backendScripts = new Set(backendSafe.backendScripts ?? []);
  const baselineScripts = new Set(baseline.requiredGreenScripts ?? []);
  const baselineArtifacts = new Set((baseline.trackedArtifacts ?? []).map((artifact) => artifact.path));
  const releaseGateIds = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.gateId));
  const releaseGateCommands = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.command));
  const productionDomain = (backendOps.requiredDomains ?? []).find((domain) => domain.domainId === 'production-secret-boundary');

  if (scripts[gateScript] !== 'node scripts/check-production-secret-boundary.mjs') {
    violations.push(`${packagePath}: ${gateScript} must run scripts/check-production-secret-boundary.mjs`);
  }
  if (!backendScripts.has(gateScript)) {
    violations.push(`${backendSafePath}: backendScripts must include ${gateScript}`);
  }
  if (!baselineScripts.has(gateScript)) {
    violations.push(`${baselinePath}: requiredGreenScripts must include ${gateScript}`);
  }
  if (!baselineArtifacts.has(contractPath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include ${contractPath}`);
  }
  if (!releaseGateIds.has(gateId)) {
    violations.push(`${releaseContractPath}: requiredGates must include ${gateId}`);
  }
  if (!releaseGateCommands.has(gateCommand)) {
    violations.push(`${releaseContractPath}: requiredGates must include ${gateCommand}`);
  }
  if (productionDomain === undefined) {
    violations.push(`${backendOpsPath}: requiredDomains must include production-secret-boundary`);
    return;
  }
  if (!productionDomain.gates?.includes(gateScript)) {
    violations.push(`${backendOpsPath}: production-secret-boundary domain must include ${gateScript}`);
  }
  if (!productionDomain.releaseGateIds?.includes(gateId)) {
    violations.push(`${backendOpsPath}: production-secret-boundary domain must include ${gateId}`);
  }
  if (!productionDomain.artifacts?.includes(contractPath)) {
    violations.push(`${backendOpsPath}: production-secret-boundary domain must include ${contractPath}`);
  }
}

function parseEnvExample(body) {
  const env = new Map();
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }
    const [name, ...valueParts] = trimmed.split('=');
    env.set(name, valueParts.join('='));
  }
  return env;
}

function assertNoForbiddenCommittedValues(body, path, options) {
  for (const pattern of contract.forbiddenCommittedValuePatterns ?? []) {
    if (!body.includes(pattern)) {
      continue;
    }
    if (options.allowLocalOnlyCredentialUrls === true && isAllowedLocalOnlyPattern(pattern, body)) {
      continue;
    }
    violations.push(`${path}: must not contain committed production secret-like value pattern ${pattern}`);
  }
}

function isAllowedLocalOnlyPattern(pattern, body) {
  if (!['postgresql://', 'postgres://', 'amqp://'].includes(pattern)) {
    return false;
  }
  return [
    'SOCIAL_MONITOR_RUNTIME_PROFILE=local-dev',
    'social_monitor_local_password@postgres',
    'social_monitor_local_password@rabbitmq',
  ].some((marker) => body.includes(marker));
}

function requiredRunnerEnvNames() {
  return new Set((evidenceRunner.jobs ?? []).flatMap((job) => job.requiredEnv ?? []));
}
