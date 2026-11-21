// Preserve legacy read/parse order and native JSON/filesystem errors behind injected I/O.
export function loadExternalBetaReadinessSnapshot(readFileSync) {
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
  return {
    contractPath, packagePath, contract, sourceCertification, feedback, decision,
    scripts, verifyScript, backendSafeScripts,
  };
}
