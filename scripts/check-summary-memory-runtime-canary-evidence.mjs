import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

const contractPath = 'ops/release/summary-memory-runtime-canary.json';
const packagePath = 'package.json';
const runnerPath = 'scripts/check-summary-memory-runtime-canary.ts';
const violations = [];
const contract = readJson(contractPath);
const packageJson = readJson(packagePath);
const packageScripts = packageJson.scripts ?? {};

if (contract.schemaVersion !== 1) {
  violations.push(`${contractPath}: schemaVersion must be 1`);
}

if (contract.contractId !== 'summary-memory-runtime-canary-v1') {
  violations.push(`${contractPath}: contractId must be summary-memory-runtime-canary-v1`);
}

if (contract.externalBetaStatus !== 'hold_until_runtime_canary_evidence' && contract.externalBetaStatus !== 'passed') {
  violations.push(`${contractPath}: externalBetaStatus must be hold_until_runtime_canary_evidence or passed`);
}

if (contract.runnerCommand !== 'npm run check:summary-memory-runtime-canary') {
  violations.push(`${contractPath}: runnerCommand must run check:summary-memory-runtime-canary`);
}

if (contract.checkCommand !== 'npm run check:summary-memory-runtime-canary-evidence') {
  violations.push(`${contractPath}: checkCommand must run check:summary-memory-runtime-canary-evidence`);
}

if (packageScripts['check:summary-memory-runtime-canary'] !== 'node scripts/run-with-timeout.mjs --timeout-ms 90000 --node-options --max-old-space-size=768 -- ts-node -r tsconfig-paths/register scripts/check-summary-memory-runtime-canary.ts') {
  violations.push(`${packagePath}: check:summary-memory-runtime-canary must run the checked runtime canary script`);
}

if (packageScripts['check:summary-memory-runtime-canary-evidence'] !== 'node scripts/check-summary-memory-runtime-canary-evidence.mjs') {
  violations.push(`${packagePath}: check:summary-memory-runtime-canary-evidence must run scripts/check-summary-memory-runtime-canary-evidence.mjs`);
}

if (!existsSync(contract.runnerFile ?? '')) {
  violations.push(`${contractPath}: runnerFile must exist`);
}

if (!existsSync(contract.checkFile ?? '')) {
  violations.push(`${contractPath}: checkFile must exist`);
}

if (contract.artifactEnv !== 'SUMMARY_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH') {
  violations.push(`${contractPath}: artifactEnv must be SUMMARY_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH`);
}

for (const envName of ['INFINITY_CONTEXT_URL', 'INFINITY_CONTEXT_TOKEN']) {
  if (!Array.isArray(contract.requiredRuntimeEnv) || !contract.requiredRuntimeEnv.includes(envName)) {
    violations.push(`${contractPath}: requiredRuntimeEnv must include ${envName}`);
  }
}

validateRunnerSource();
validateExpectedArtifactContract();
validateRuntimeArtifactIfProvided();

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Summary memory runtime canary evidence contract OK');

function validateRunnerSource() {
  const source = readFileSync(runnerPath, 'utf8');
  for (const marker of [
    'INFINITY_CONTEXT_URL',
    'INFINITY_CONTEXT_TOKEN',
    'SUMMARY_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH',
    'writeLiveEvidenceArtifactAtomically',
    "artifactId: 'summary-memory-runtime-canary-v1'",
    'tokenIncluded: false',
    'rawAuthorizationHeaderIncluded: false',
    'rawMemoryTextIncluded: false',
    'rawSourceTextIncluded: false',
  ]) {
    if (!source.includes(marker)) {
      violations.push(`${runnerPath}: missing runtime canary marker "${marker}"`);
    }
  }
}

function validateExpectedArtifactContract() {
  const expected = contract.expectedArtifact;
  if (expected?.artifactId !== 'summary-memory-runtime-canary-v1') {
    violations.push(`${contractPath}: expectedArtifact.artifactId must be summary-memory-runtime-canary-v1`);
  }
  if (expected?.schemaVersion !== 1) {
    violations.push(`${contractPath}: expectedArtifact.schemaVersion must be 1`);
  }

  for (const field of ['beforeStatus', 'afterStatus', 'afterFactsUsed', 'memoryEffectMatched', 'supportStatus']) {
    if (!Array.isArray(expected?.requiredResultFields) || !expected.requiredResultFields.includes(field)) {
      violations.push(`${contractPath}: expectedArtifact.requiredResultFields must include ${field}`);
    }
  }

  for (const [field, expectedValue] of Object.entries(expected?.requiredRedactionFlags ?? {})) {
    if (expectedValue !== false) {
      violations.push(`${contractPath}: expectedArtifact.requiredRedactionFlags.${field} must be false`);
    }
  }
}

function validateRuntimeArtifactIfProvided() {
  const artifactPath = process.env.SUMMARY_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH?.trim();
  if (artifactPath === undefined || artifactPath.length === 0) {
    if (contract.externalBetaStatus === 'passed') {
      violations.push(`${contractPath}: externalBetaStatus passed requires SUMMARY_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH`);
    }
    return;
  }

  if (!isAbsolute(artifactPath) || !artifactPath.endsWith('.json')) {
    violations.push('SUMMARY_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH must be an absolute .json path');
    return;
  }
  if (!existsSync(artifactPath)) {
    violations.push(`SUMMARY_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH does not exist: ${artifactPath}`);
    return;
  }

  const stat = statSync(artifactPath);
  if (!stat.isFile()) {
    violations.push(`SUMMARY_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH must point at a file: ${artifactPath}`);
    return;
  }
  if ((stat.mode & 0o077) !== 0) {
    violations.push(`SUMMARY_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH must use private 0600-style permissions: ${artifactPath}`);
  }

  const artifact = readJson(artifactPath);
  if (artifact.schemaVersion !== 1) {
    violations.push(`${artifactPath}: schemaVersion must be 1`);
  }
  if (artifact.artifactId !== 'summary-memory-runtime-canary-v1') {
    violations.push(`${artifactPath}: artifactId must be summary-memory-runtime-canary-v1`);
  }
  if (artifact.result?.afterStatus !== 'available') {
    violations.push(`${artifactPath}: result.afterStatus must be available`);
  }
  if (!hasMemoryEffectEvidence(artifact.result)) {
    violations.push(`${artifactPath}: result.afterFactsUsed or result.memoryEffectMatched must prove retrieved memory`);
  }
  for (const [field, expectedValue] of Object.entries(contract.expectedArtifact.requiredRedactionFlags)) {
    if (artifact.redaction?.[field] !== expectedValue) {
      violations.push(`${artifactPath}: redaction.${field} must be ${expectedValue}`);
    }
  }

  const serialized = JSON.stringify(artifact);
  for (const forbidden of ['INFINITY_CONTEXT_TOKEN', 'Bearer ', 'Prefer shorter summaries']) {
    if (serialized.includes(forbidden)) {
      violations.push(`${artifactPath}: artifact must not contain sensitive/raw memory fragment "${forbidden}"`);
    }
  }
}

function hasPositiveFactEvidence(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hasMemoryEffectEvidence(result) {
  return hasPositiveFactEvidence(result?.afterFactsUsed) || result?.memoryEffectMatched === true;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
