// Synthetic credential rotation evidence builders; the caller loads each fixture.
export function sourceCredentialRotationArtifact(artifact) {
  applyCredentialRotationRealEvidence(artifact, {
    evidenceKind: 'staging_source_credential_rotation',
    collectionMethod: 'Rotation drill captured from staging source credential boundary.',
    runner: 'scripts/capture-source-credential-rotation.ts',
  });
  return artifact;
}

export function webhookSecretRotationArtifact(artifact) {
  applyCredentialRotationRealEvidence(artifact, {
    evidenceKind: 'staging_webhook_secret_rotation',
    collectionMethod: 'Rotation drill captured from staging webhook secret boundary.',
    runner: 'scripts/capture-webhook-secret-rotation.ts',
  });
  return artifact;
}

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

