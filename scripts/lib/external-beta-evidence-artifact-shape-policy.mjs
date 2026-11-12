export function validateArtifactIdentity(content, job, artifact, violations) {
  const expectedArtifactId = artifact.expectedArtifactId;
  if (expectedArtifactId === undefined) {
    return;
  }
  if (typeof expectedArtifactId !== 'string' || expectedArtifactId.trim().length === 0) {
    violations.push(`${job.jobId}: output artifact env ${artifact.env} has invalid expectedArtifactId`);
    return;
  }
  if (content.artifactId !== expectedArtifactId) {
    violations.push(`${job.jobId}: output artifact env ${artifact.env} must use artifactId ${expectedArtifactId}`);
  }
}

export function validateArtifactProviderKeys(content, job, artifact, violations) {
  if (artifact.expectedProviderKeys === undefined) {
    return;
  }
  if (!Array.isArray(artifact.expectedProviderKeys) || artifact.expectedProviderKeys.length === 0) {
    violations.push(`${job.jobId}: output artifact env ${artifact.env} has invalid expectedProviderKeys`);
    return;
  }

  const expectedProviderKeys = new Set(artifact.expectedProviderKeys);
  if (expectedProviderKeys.size !== artifact.expectedProviderKeys.length) {
    violations.push(`${job.jobId}: output artifact env ${artifact.env} has duplicate expectedProviderKeys`);
    return;
  }
  if (![...expectedProviderKeys].every((providerKey) => typeof providerKey === 'string' && providerKey.trim().length > 0)) {
    violations.push(`${job.jobId}: output artifact env ${artifact.env} has invalid expectedProviderKeys`);
    return;
  }

  if (!Array.isArray(content.providerResults)) {
    violations.push(`${job.jobId}: output artifact env ${artifact.env} must include providerResults`);
    return;
  }

  const observedProviderKeys = new Set();
  for (const result of content.providerResults) {
    if (typeof result?.providerKey === 'string' && result.providerKey.trim().length > 0) {
      observedProviderKeys.add(result.providerKey.trim());
    }
  }
  for (const providerKey of expectedProviderKeys) {
    if (!observedProviderKeys.has(providerKey)) {
      violations.push(`${job.jobId}: output artifact env ${artifact.env} must include providerKey ${providerKey}`);
    }
  }
  for (const providerKey of observedProviderKeys) {
    if (!expectedProviderKeys.has(providerKey)) {
      violations.push(`${job.jobId}: output artifact env ${artifact.env} must not include providerKey ${providerKey}`);
    }
  }
}
