export function createDockerStagingArtifactPolicy({ violations, captureScriptPath, forbiddenBundleFragments, isRecord }) {
  function validateProvenance(provenance, label) {
    if (!isRecord(provenance)) {
      violations.push(`${label}: provenance must be an object`);
      return;
    }
    if (provenance.evidenceKind !== 'docker_staging_bundle') {
      violations.push(`${label}: provenance.evidenceKind must be docker_staging_bundle`);
    }
    if (provenance.runner !== captureScriptPath) {
      violations.push(`${label}: provenance.runner must be ${captureScriptPath}`);
    }
    if (provenance.fixtureOnly !== false) {
      violations.push(`${label}: provenance.fixtureOnly must be false`);
    }
  }

  function validateBundleRedaction(redaction, label) {
    if (!isRecord(redaction)) {
      violations.push(`${label}: redaction must be an object`);
      return;
    }
    for (const field of ['secretsIncluded', 'rawProviderPayloadsIncluded', 'databaseUrlsIncluded', 'brokerUrlsIncluded']) {
      if (redaction[field] !== false) {
        violations.push(`${label}: redaction.${field} must be false`);
      }
    }
  }

  function validateForbiddenBundleFragments(bundle, label) {
    const serialized = JSON.stringify(bundle);
    for (const fragment of forbiddenBundleFragments) {
      if (serialized.includes(fragment)) {
        violations.push(`${label}: bundle summary must not include sensitive fragment ${fragment}`);
      }
    }
  }

  function validateCounts(summary, artifact, definition, label) {
    const signalResults = Array.isArray(artifact.signalResults) ? artifact.signalResults : [];
    const operations = Array.isArray(artifact.operations) ? artifact.operations : [];
    const surfaces = Array.isArray(artifact.surfaces) ? artifact.surfaces : [];
    const sourceExports = Array.isArray(artifact.sourceExports) ? artifact.sourceExports : [];
    const smokeResults = Array.isArray(artifact.smokeResults) ? artifact.smokeResults : [];
    const countPairs = [
      ['signalCount', signalResults.length, definition.minSignalCount ?? 0],
      ['operationCount', operations.length, definition.minOperationCount ?? 0],
      ['surfaceCount', surfaces.length, definition.minSurfaceCount ?? 0],
      ['sourceExportCount', sourceExports.length, definition.minSourceExportCount ?? 0],
      ['smokeCount', smokeResults.length, definition.minSmokeCount ?? 0],
    ];

    for (const [field, actualCount, minimum] of countPairs) {
      if (summary[field] !== actualCount) {
        violations.push(`${label}: ${summary.artifactId}.${field} must match artifact file`);
      }
      if (actualCount < minimum) {
        violations.push(`${label}: ${summary.artifactId}.${field} must be at least ${minimum}`);
      }
    }
  }

  function validateArtifactRedaction(artifact, label) {
    if (!isRecord(artifact.redaction)) {
      return;
    }
    for (const [field, value] of Object.entries(artifact.redaction)) {
      if (field.endsWith('Included') && value !== false) {
        violations.push(`${label}: redaction.${field} must be false`);
      }
    }
  }

  function validateDurableRuntimeArtifact(artifact, label) {
    const services = new Set((artifact.services ?? []).map((service) => service.serviceId));
    for (const serviceId of ['api-gateway', 'ingestion-worker', 'intelligence-worker', 'delivery-service', 'event-relay']) {
      if (!services.has(serviceId)) {
        violations.push(`${label}: durable-runtime-selector missing service ${serviceId}`);
      }
    }
    if (artifact.rollup?.allServicesDurable !== true) {
      violations.push(`${label}: durable-runtime-selector rollup.allServicesDurable must be true`);
    }
    if (artifact.rollup?.forbiddenSelectorsFound !== false) {
      violations.push(`${label}: durable-runtime-selector rollup.forbiddenSelectorsFound must be false`);
    }
  }
  return {
    validateProvenance,
    validateBundleRedaction,
    validateForbiddenBundleFragments,
    validateCounts,
    validateArtifactRedaction,
    validateDurableRuntimeArtifact,
  };
}
