import { existsSync, readFileSync } from 'node:fs';

const proofPath = 'ops/release/durable-runtime-proof.json';
const persistencePath = 'ops/release/persistence-readiness-contract.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const proof = JSON.parse(readFileSync(proofPath, 'utf8'));
const persistence = JSON.parse(readFileSync(persistencePath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const backendSafe = JSON.parse(readFileSync(backendSafePath, 'utf8'));
const scripts = packageJson.scripts ?? {};
const verifyScript = String(scripts.verify ?? '');
const backendSafeScripts = new Set(backendSafe.backendScripts ?? []);
const hasVerificationScript = (scriptName) =>
  verifyScript.includes(`npm run ${scriptName}`) || backendSafeScripts.has(scriptName);
const violations = [];

if (proof.schemaVersion !== 1) {
  violations.push(`${proofPath}: schemaVersion must be 1`);
}

if (proof.scope !== 'backend-only') {
  violations.push(`${proofPath}: scope must be backend-only`);
}

if (proof.proofMode !== 'compose_contract_without_live_deploy') {
  violations.push(`${proofPath}: proofMode must stay compose_contract_without_live_deploy until staging evidence is attached`);
}

if (proof.externalBetaStatus !== 'hold_until_staging_runtime_evidence') {
  violations.push(`${proofPath}: externalBetaStatus must hold until staging runtime evidence exists`);
}

if (!existsSync(proof.composeFile)) {
  violations.push(`${proofPath}: composeFile must exist`);
} else {
  const compose = readFileSync(proof.composeFile, 'utf8');
  for (const marker of proof.requiredComposeMarkers ?? []) {
    if (!compose.includes(marker)) {
      violations.push(`${proof.composeFile}: missing durable runtime marker "${marker}"`);
    }
  }

  for (const forbidden of proof.forbiddenBetaSelectorValues ?? []) {
    if (compose.includes(forbidden)) {
      violations.push(`${proof.composeFile}: beta compose must not include forbidden selector "${forbidden}"`);
    }
  }
}

if (persistence.mvpRuntimeDecision?.blocksExternalBeta !== true) {
  violations.push(`${persistencePath}: persistence readiness must continue blocking external beta without deployed runtime proof`);
}

if (!Array.isArray(proof.stagingExitCriteria) || proof.stagingExitCriteria.length < 4) {
  violations.push(`${proofPath}: stagingExitCriteria must list concrete staging evidence`);
}

for (const requiredScript of ['check:durable-runtime-proof', 'check:persistence-readiness']) {
  if (!scripts[requiredScript]) {
    violations.push(`${packagePath}: missing ${requiredScript}`);
  }
  if (!hasVerificationScript(requiredScript)) {
    violations.push(`${packagePath}: npm run verify or verify:backend must include ${requiredScript}`);
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Durable runtime proof contract OK');
