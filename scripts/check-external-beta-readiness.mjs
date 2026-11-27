import { existsSync, readFileSync } from 'node:fs';
import { loadExternalBetaReadinessSnapshot } from './lib/external-beta-readiness-input-snapshot.mjs';
import { validateExternalBetaContractAdmission } from './lib/external-beta-readiness-contract-admission.mjs';
import { validateExternalBetaEvidenceGroups } from './lib/external-beta-readiness-evidence-groups.mjs';
import { validateExternalBetaCapacityAndExceptions } from './lib/external-beta-readiness-capacity-no-go-policy.mjs';
import { validateExternalBetaGoCrossEvidence } from './lib/external-beta-readiness-go-cross-evidence.mjs';
import { validateExternalBetaNpmVerification } from './lib/external-beta-readiness-npm-verification.mjs';

const {
  contractPath, packagePath, contract, sourceCertification, feedback, decision,
  scripts, verifyScript, backendSafeScripts,
} = loadExternalBetaReadinessSnapshot(readFileSync);
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
