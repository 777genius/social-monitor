// Validate the one approved ownership move without weakening real-evidence identity checks.
export function hasStagingRealEvidenceIdentityDelegation(checkerSource, policySource) {
  return /from\s+['"]\.\/lib\/staging-reliability-artifact-guards\.mjs['"]/.test(checkerSource)
    && /\bcreateStagingReliabilityArtifactGuards\(violations\)/.test(checkerSource)
    && /^\s*validateRealArtifactIdentity,/m.test(checkerSource)
    && /from\s+['"]\.\/evidence-provenance\.mjs['"]/.test(policySource)
    && /^\s*validateRealEvidenceIdentityStrings\(\{/m.test(policySource)
    && /^\s*function validateRealArtifactIdentity\(/m.test(policySource)
    && /^\s*validateRealArtifactIdentity,/m.test(policySource);
}
