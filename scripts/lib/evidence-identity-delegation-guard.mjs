// Validate the one approved ownership move without weakening real-evidence identity checks.
export function hasStagingRealEvidenceIdentityDelegation(checkerSource, policySource) {
  return /from\s+['"]\.\/lib\/staging-reliability-artifact-guards\.mjs['"]/.test(checkerSource)
    && /\bcreateStagingReliabilityArtifactGuards\(violations\)/.test(checkerSource)
    && /^\s*validateRealArtifactIdentity,/m.test(checkerSource)
    && /from\s+['"]\.\/evidence-provenance\.mjs['"]/.test(policySource)
    && /^\s*validateRealEvidenceIdentityStrings\(\{/m.test(policySource)
    && /^\s*function validateRealArtifactIdentity\(/m.test(policySource)
    && /^\s*validateRealArtifactIdentity,/m.test(policySource)
    // All three existing artifact paths must still invoke the delegated identity validator.
    && /\bvalidateRealArtifactIdentity\(\s*artifact,\s*`\$\{evidencePath\}: stagingEvidenceArtifacts\.\$\{artifact\.artifactId\}`,\s*\)/.test(checkerSource)
    && /\bvalidateRealArtifactIdentity\(\s*content,\s*artifact\.path\s*\)/.test(checkerSource)
    && /\bvalidateRealArtifactIdentity\(\s*content,\s*artifactLabel\s*\)/.test(checkerSource);
}
