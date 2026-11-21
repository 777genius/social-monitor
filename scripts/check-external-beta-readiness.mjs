import { existsSync, readFileSync } from 'node:fs';
import { validateExternalBetaContractAdmission } from './lib/external-beta-readiness-contract-admission.mjs';
import { validateExternalBetaEvidenceGroups } from './lib/external-beta-readiness-evidence-groups.mjs';
import { validateExternalBetaCapacityAndExceptions } from './lib/external-beta-readiness-capacity-no-go-policy.mjs';
import { validateExternalBetaGoCrossEvidence } from './lib/external-beta-readiness-go-cross-evidence.mjs';
import { validateExternalBetaNpmVerification } from './lib/external-beta-readiness-npm-verification.mjs';

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
const violations = [];

validateExternalBetaContractAdmission({ contract, contractPath, scripts, existsSync, violations });

validateExternalBetaEvidenceGroups({ contract, scripts, existsSync, contractPath, violations });

validateExternalBetaGoCrossEvidence({ contract, sourceCertification, feedback, decision, contractPath, violations });

validateExternalBetaCapacityAndExceptions({ contract, contractPath, violations });

validateExternalBetaNpmVerification({ scripts, verifyScript, backendSafeScripts, packagePath, violations });

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('External beta readiness contract OK');
