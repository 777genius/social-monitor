// Exclude inactive call text before verifying the three existing quality guards.
function activeSource(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[ \t])\/\/[^\n]*/gm, '$1');
}

// Validate the one approved ownership move without weakening real-evidence identity checks.
export function hasStagingRealEvidenceIdentityDelegation(checkerSource, policySource) {
  const checker = activeSource(checkerSource);
  const policy = activeSource(policySource);
  return /from\s+['"]\.\/lib\/staging-reliability-artifact-guards\.mjs['"]/.test(checker)
    && /\bcreateStagingReliabilityArtifactGuards\(violations\)/.test(checker)
    && /^\s*validateRealArtifactIdentity,/m.test(checker)
    && /from\s+['"]\.\/evidence-provenance\.mjs['"]/.test(policy)
    && /^\s*validateRealEvidenceIdentityStrings\(\{/m.test(policy)
    && /^\s*function validateRealArtifactIdentity\(/m.test(policy)
    && /^\s*validateRealArtifactIdentity,/m.test(policy)
    // All three existing artifact paths must still invoke the delegated identity validator.
    && /\bvalidateRealArtifactIdentity\(\s*artifact,\s*`\$\{evidencePath\}: stagingEvidenceArtifacts\.\$\{artifact\.artifactId\}`,\s*\)/.test(checker)
    && /\bvalidateRealArtifactIdentity\(\s*content,\s*artifact\.path\s*\)/.test(checker)
    && /\bvalidateRealArtifactIdentity\(\s*content,\s*artifactLabel\s*\)/.test(checker);
}
