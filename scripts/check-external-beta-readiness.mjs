import { existsSync, readFileSync } from 'node:fs';
import { validateExternalBetaEvidenceGroups } from './lib/external-beta-readiness-evidence-groups.mjs';
import { validateExternalBetaCapacityAndExceptions } from './lib/external-beta-readiness-capacity-no-go-policy.mjs';

const contractPath = 'ops/release/external-beta-readiness-contract.json';
const sourceCertificationPath = 'ops/ingestion/source-provider-certification.json';
const feedbackPath = 'ops/release/beta-feedback-classification-report.json';
const decisionPath = 'ops/release/beta-ring-expansion-decision-record.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const sourceCertification = JSON.parse(readFileSync(sourceCertificationPath, 'utf8'));
const feedback = JSON.parse(readFileSync(feedbackPath, 'utf8'));
const decision = JSON.parse(readFileSync(decisionPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const backendSafe = JSON.parse(readFileSync(backendSafePath, 'utf8'));
const scripts = packageJson.scripts ?? {};
const verifyScript = String(scripts.verify ?? '');
const backendSafeScripts = new Set(backendSafe.backendScripts ?? []);
const hasVerificationScript = (scriptName) =>
  verifyScript.includes(`npm run ${scriptName}`) || backendSafeScripts.has(scriptName);
const violations = [];

const requiredGoDecisionCriteriaFragments = new Set([
  'durable runtime proof',
  'live source provider certification',
  'credential and secret runtime flow',
  'RabbitMQ and Postgres staging drills',
  'backend durable E2E loop',
  'summary blocker feedback',
  'security final sweep',
  'release artifact evidence',
  'capacity envelope and no-go cleanup',
]);

if (contract.schemaVersion !== 1) {
  violations.push(`${contractPath}: schemaVersion must be 1`);
}

if (contract.scope !== 'backend-only') {
  violations.push(`${contractPath}: scope must be backend-only`);
}

if (contract.frontendPolicy !== 'deferred_contract_only') {
  violations.push(`${contractPath}: frontendPolicy must keep frontend deferred`);
}

if (contract.evidenceMode !== 'fixture_contract_with_external_evidence_required') {
  violations.push(`${contractPath}: evidenceMode must remain fixture_contract_with_external_evidence_required until live evidence exists`);
}

if (!['hold', 'go', 'rework'].includes(contract.externalBetaDecision)) {
  violations.push(`${contractPath}: externalBetaDecision must be hold, go or rework`);
}

validateGoDecisionExitCriteria();

const evidenceRunner = contract.evidenceRunner;
if (typeof evidenceRunner !== 'object' || evidenceRunner === null) {
  violations.push(`${contractPath}: evidenceRunner is required`);
} else {
  if (!existsSync(evidenceRunner.contract ?? '')) {
    violations.push(`${contractPath}: evidenceRunner.contract must reference an existing contract`);
  }
  for (const field of [
    'checkCommand',
    'planCommand',
    'jsonPlanCommand',
    'summaryCommand',
    'preflightCommand',
    'artifactValidationCommand',
    'dockerBundleImportCommand',
    'currentPackageCommand',
  ]) {
    const scriptName = scriptNameFromNpmCommand(evidenceRunner[field]);
    if (scriptName === null || !scripts[scriptName]) {
      violations.push(`${contractPath}: evidenceRunner.${field} must reference an existing npm script`);
    }
  }
}

validateExternalBetaEvidenceGroups({ contract, scripts, existsSync, contractPath, violations });

if (contract.externalBetaDecision === 'go') {
  if (sourceCertification.certifiedProviders.some((provider) => provider.liveBetaReady !== true)) {
    violations.push(`${contractPath}: go requires every certified provider to be liveBetaReady`);
  }
  if (feedback.evidenceMode !== 'redacted_beta_samples') {
    violations.push(`${contractPath}: go requires redacted beta feedback samples`);
  }
  if (decision.decision !== 'go') {
    violations.push(`${contractPath}: go requires beta ring decision to be go`);
  }
}

validateExternalBetaCapacityAndExceptions({ contract, contractPath, violations });

if (!scripts['check:external-beta-readiness']) {
  violations.push(`${packagePath}: missing check:external-beta-readiness`);
}
if (!hasVerificationScript('check:external-beta-readiness')) {
  violations.push(`${packagePath}: npm run verify or verify:backend must include check:external-beta-readiness`);
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('External beta readiness contract OK');

function validateGoDecisionExitCriteria() {
  if (!Array.isArray(contract.goDecisionExitCriteria) || contract.goDecisionExitCriteria.length === 0) {
    violations.push(`${contractPath}: goDecisionExitCriteria must list every blocking go prerequisite`);
    return;
  }

  const criteriaText = contract.goDecisionExitCriteria.join('\n').toLowerCase();
  for (const fragment of requiredGoDecisionCriteriaFragments) {
    if (!criteriaText.includes(fragment.toLowerCase())) {
      violations.push(`${contractPath}: goDecisionExitCriteria must include "${fragment}"`);
    }
  }
}

function scriptNameFromNpmCommand(command) {
  const match = /^npm run (?:--silent )?([^ ]+)/.exec(String(command ?? ''));
  return match?.[1] ?? null;
}
