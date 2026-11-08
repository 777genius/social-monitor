// Synthetic credential rotation evidence builders; the caller loads each fixture.
/** Build the original staging source-credential rotation evidence from a caller-owned fixture. */
export function sourceCredentialRotationArtifact(artifact) {
  applyCredentialRotationRealEvidence(artifact, {
    evidenceKind: 'staging_source_credential_rotation',
    collectionMethod: 'Rotation drill captured from staging source credential boundary.',
    runner: 'scripts/capture-source-credential-rotation.ts',
  });
  return artifact;
}

/** Build the original staging webhook-secret rotation evidence from a caller-owned fixture. */
export function webhookSecretRotationArtifact(artifact) {
  applyCredentialRotationRealEvidence(artifact, {
    evidenceKind: 'staging_webhook_secret_rotation',
    collectionMethod: 'Rotation drill captured from staging webhook secret boundary.',
    runner: 'scripts/capture-webhook-secret-rotation.ts',
  });
  return artifact;
}

/** Stamp existing provenance, environment and operation timestamps without changing evidence data. */
function applyCredentialRotationRealEvidence(artifact, provenance) {
  const now = new Date().toISOString();
  artifact.provenance = {
    ...provenance,
    fixtureOnly: false,
  };
  artifact.environment = {
    environmentId: 'staging-secret-rotation-alpha-1',
    secretStoreId: 'secret-store-staging-alpha-1',
    sampledAt: now,
    operator: 'security-owner-1',
  };
  artifact.operations = artifact.operations.map((operation) => ({
    ...operation,
    observedAt: now,
  }));
}

