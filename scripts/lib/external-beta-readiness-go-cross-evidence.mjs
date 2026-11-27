/** Check external GO readiness against independent live evidence, preserving legacy validation order. */
export function validateExternalBetaGoCrossEvidence({ contract, sourceCertification, feedback, decision, contractPath, violations }) {
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
}
