import { existsSync, readFileSync } from 'node:fs';
import { validateExternalBetaContractAdmission } from './lib/external-beta-readiness-contract-admission.mjs';
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

validateExternalBetaContractAdmission({ contract, contractPath, scripts, existsSync, violations });

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
