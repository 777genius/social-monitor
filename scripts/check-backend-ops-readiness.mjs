import { existsSync, readFileSync } from 'node:fs';

const contractPath = 'ops/release/backend-ops-readiness-contract.json';
const packagePath = 'package.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const contract = readJson(contractPath);
const packageJson = readJson(packagePath);
const releaseContract = readJson(releaseContractPath);
const sourceCertification = readJson(contract.sourceCertification);
const scripts = packageJson.scripts ?? {};
const verifyScript = String(scripts.verify ?? '');
const releaseGateIds = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.gateId));
const releaseGateCommands = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.command));
const violations = [];

const requiredDomains = new Set([
  'auth-boundary',
  'durable-runtime',
  'postgres-reliability',
  'rabbitmq-reliability',
  'observability-and-drills',
  'source-scope',
  'mvp-loop',
]);

if (contract.schemaVersion !== 1) {
  violations.push(`${contractPath}: schemaVersion must be 1`);
}

if (contract.scope !== 'backend-only') {
  violations.push(`${contractPath}: scope must be backend-only`);
}

if (contract.frontendPolicy !== 'deferred_contract_only') {
  violations.push(`${contractPath}: frontendPolicy must keep frontend implementation deferred`);
}

if (contract.realSocialCredentialsRequiredForThisGate !== false) {
  violations.push(`${contractPath}: backend ops readiness gate must not require live social credentials`);
}

if (!Array.isArray(contract.liveSocialCredentialExitCriteria) || contract.liveSocialCredentialExitCriteria.length < 3) {
  violations.push(`${contractPath}: liveSocialCredentialExitCriteria must list concrete live-beta exit criteria`);
}

if (contract.releaseContract !== releaseContractPath) {
  violations.push(`${contractPath}: releaseContract must reference ${releaseContractPath}`);
}

const domainIds = new Set();
for (const domain of contract.requiredDomains ?? []) {
  if (domainIds.has(domain.domainId)) {
    violations.push(`${contractPath}: duplicate domainId "${domain.domainId}"`);
  }
  domainIds.add(domain.domainId);

  if (!requiredDomains.has(domain.domainId)) {
    violations.push(`${contractPath}: unsupported domainId "${domain.domainId}"`);
  }

  requireNonEmptyArray(domain.gates, `${domain.domainId}.gates`);
  requireNonEmptyArray(domain.releaseGateIds, `${domain.domainId}.releaseGateIds`);
  requireNonEmptyArray(domain.artifacts, `${domain.domainId}.artifacts`);

  for (const gate of domain.gates ?? []) {
    const scriptName = String(gate).replace(/^check:/, 'check:');
    if (!scripts[scriptName]) {
      violations.push(`${contractPath}: domain "${domain.domainId}" references missing npm script "${scriptName}"`);
    }
    if (!verifyScript.includes(`npm run ${scriptName}`)) {
      violations.push(`${packagePath}: npm run verify must include backend readiness script "${scriptName}"`);
    }
    if (!releaseGateCommands.has(`npm run ${scriptName}`)) {
      violations.push(`${releaseContractPath}: release gates must include "${scriptName}" for domain "${domain.domainId}"`);
    }
  }

  for (const releaseGateId of domain.releaseGateIds ?? []) {
    if (!releaseGateIds.has(releaseGateId)) {
      violations.push(`${releaseContractPath}: missing backend readiness release gate "${releaseGateId}"`);
    }
  }

  for (const artifact of domain.artifacts ?? []) {
    if (!existsSync(artifact)) {
      violations.push(`${contractPath}: domain "${domain.domainId}" references missing artifact "${artifact}"`);
    }
  }
}

for (const requiredDomain of requiredDomains) {
  if (!domainIds.has(requiredDomain)) {
    violations.push(`${contractPath}: missing required domain "${requiredDomain}"`);
  }
}

for (const marker of contract.requiredRuntimeMarkers ?? []) {
  if (!existsSync(marker.file)) {
    violations.push(`${contractPath}: runtime marker file does not exist "${marker.file}"`);
    continue;
  }

  if (!readFileSync(marker.file, 'utf8').includes(marker.marker)) {
    violations.push(`${marker.file}: missing backend runtime marker "${marker.marker}"`);
  }
}

if (!verifyScript.includes('npm run check:backend-ops-readiness')) {
  violations.push(`${packagePath}: npm run verify must include check:backend-ops-readiness`);
}

if (!releaseGateIds.has('backend-ops-readiness')) {
  violations.push(`${releaseContractPath}: missing backend-ops-readiness release gate`);
}

if (sourceCertification.fixtureMode !== 'deterministic_no_network') {
  violations.push(`${contract.sourceCertification}: source certification must stay deterministic_no_network for this gate`);
}

for (const provider of sourceCertification.certifiedProviders ?? []) {
  if (provider.readinessState === 'enabled_beta' && provider.liveBetaReady !== false) {
    violations.push(`${contract.sourceCertification}: provider "${provider.providerKey}" must not claim live beta readiness from fixture gate`);
  }

  if (
    provider.readinessState === 'enabled_beta' &&
    (!Array.isArray(provider.liveBetaBlockers) || provider.liveBetaBlockers.length === 0)
  ) {
    violations.push(`${contract.sourceCertification}: provider "${provider.providerKey}" must declare live beta blockers`);
  }
}

if (!Array.isArray(sourceCertification.deferredProviders) || sourceCertification.deferredProviders.length < 2) {
  violations.push(`${contract.sourceCertification}: deferred providers must stay explicit`);
}

for (const provider of sourceCertification.deferredProviders ?? []) {
  if (provider.runtimeReadiness !== 'deferred') {
    violations.push(`${contract.sourceCertification}: deferred provider "${provider.providerKey}" must have runtimeReadiness=deferred`);
  }
}

requireExistingAnchoredDoc(contract.runbook, 'runbook');
requireExistingAnchoredDoc(contract.promotionDoc, 'promotionDoc');

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Backend ops readiness contract OK');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function requireNonEmptyArray(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    violations.push(`${contractPath}: ${field} must be a non-empty array`);
  }
}

function requireExistingAnchoredDoc(reference, field) {
  const [path, anchor] = String(reference ?? '').split('#');

  if (!path || !existsSync(path)) {
    violations.push(`${contractPath}: ${field} path must exist`);
    return;
  }

  if (!readFileSync(path, 'utf8').toLowerCase().includes((anchor ?? '').replaceAll('-', ' '))) {
    violations.push(`${contractPath}: ${field} anchor must point to an existing section`);
  }
}
