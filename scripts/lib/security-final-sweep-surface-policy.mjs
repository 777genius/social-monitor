// Pure security-sweep source-export and surface policy. The checker owns
// rules, diagnostics and export-file validation; no I/O on module import.
export function validateArtifactRedaction(redaction, path, context) {
  const { requiredArtifactRedactionFlags, violations } = context;
  if (redaction === null || typeof redaction !== 'object' || Array.isArray(redaction)) {
    violations.push(`${path}: redaction must be an object`);
    return;
  }

  for (const [field, expected] of Object.entries(requiredArtifactRedactionFlags)) {
    if (redaction[field] !== expected) {
      violations.push(`${path}: redaction.${field} must be ${expected}`);
    }
  }

  if (typeof redaction.method !== 'string' || redaction.method.trim().length < 20) {
    violations.push(`${path}: redaction.method must explain how staging samples were sanitized`);
  }
}

export function validateArtifactSourceExports(sourceExports, path, options, context) {
  const { requiredSourceExportEnvBySurface, isIsoDateString, validateSourceExportPath, violations } = context;
  const sourceExportMap = new Map();
  if (!Array.isArray(sourceExports)) {
    violations.push(`${path}: sourceExports must be an array`);
    return sourceExportMap;
  }

  for (const [index, sourceExport] of sourceExports.entries()) {
    const exportLabel = `${path}: sourceExports[${index}]`;
    if (sourceExport === null || typeof sourceExport !== 'object' || Array.isArray(sourceExport)) {
      violations.push(`${exportLabel}: source export must be an object`);
      continue;
    }

    const expectedEnv = requiredSourceExportEnvBySurface.get(sourceExport.surfaceId);
    if (expectedEnv === undefined) {
      violations.push(`${exportLabel}: unsupported surfaceId "${sourceExport.surfaceId}"`);
      continue;
    }
    if (sourceExportMap.has(sourceExport.surfaceId)) {
      violations.push(`${exportLabel}: duplicate source export for surfaceId "${sourceExport.surfaceId}"`);
      continue;
    }
    sourceExportMap.set(sourceExport.surfaceId, sourceExport);

    if (sourceExport.envVar !== expectedEnv) {
      violations.push(`${exportLabel}: envVar must be ${expectedEnv}`);
    }
    if (!Number.isInteger(sourceExport.sampleCount) || sourceExport.sampleCount <= 0) {
      violations.push(`${exportLabel}: sampleCount must be a positive integer`);
    }
    if (sourceExport.redactedOnly !== true) {
      violations.push(`${exportLabel}: redactedOnly must be true`);
    }
    if (sourceExport.sanitized !== true) {
      violations.push(`${exportLabel}: sanitized must be true`);
    }
    if (!isIsoDateString(sourceExport.collectedAt)) {
      violations.push(`${exportLabel}: collectedAt must be an ISO timestamp`);
    }
    validateSourceExportPath(sourceExport, exportLabel, expectedEnv, options);
  }

  for (const [surfaceId, expectedEnv] of requiredSourceExportEnvBySurface.entries()) {
    if (!sourceExportMap.has(surfaceId)) {
      violations.push(`${path}: sourceExports must include ${surfaceId} from ${expectedEnv}`);
    }
  }

  return sourceExportMap;
}

export function validateArtifactSurfaces(surfaces, path, sourceExports, context) {
  const { requiredSurfaceIds, violations } = context;
  if (!Array.isArray(surfaces)) {
    violations.push(`${path}: surfaces must be an array`);
    return;
  }

  const surfaceIds = new Set();
  for (const [index, surface] of surfaces.entries()) {
    const surfaceLabel = `${path}: surfaces[${index}]`;
    validateArtifactSurface(surface, surfaceLabel, surfaceIds, sourceExports, context);
  }

  for (const surfaceId of requiredSurfaceIds) {
    if (!surfaceIds.has(surfaceId)) {
      violations.push(`${path}: surfaces must include ${surfaceId}`);
    }
  }
}

function validateArtifactSurface(surface, surfaceLabel, surfaceIds, sourceExports, context) {
  const { requiredSurfaceIds, requiredSourceExportEnvBySurface, forbiddenArtifactKeys, violations } = context;
  if (surface === null || typeof surface !== 'object' || Array.isArray(surface)) {
    violations.push(`${surfaceLabel}: surface must be an object`);
    return;
  }

  if (!requiredSurfaceIds.has(surface.surfaceId)) {
    violations.push(`${surfaceLabel}: unsupported surfaceId "${surface.surfaceId}"`);
  } else if (surfaceIds.has(surface.surfaceId)) {
    violations.push(`${surfaceLabel}: duplicate surfaceId "${surface.surfaceId}"`);
  } else {
    surfaceIds.add(surface.surfaceId);
  }

  if (!Number.isInteger(surface.sampleCount) || surface.sampleCount <= 0) {
    violations.push(`${surfaceLabel}: sampleCount must be a positive integer`);
  }
  if (surface.scanStatus !== 'passed') {
    violations.push(`${surfaceLabel}: scanStatus must be passed`);
  }
  if (surface.redactedOnly !== true) {
    violations.push(`${surfaceLabel}: redactedOnly must be true`);
  }
  const sourceExport = sourceExports.get(surface.surfaceId);
  if (requiredSourceExportEnvBySurface.has(surface.surfaceId) && sourceExport === undefined) {
    violations.push(`${surfaceLabel}: must have a matching sourceExports entry`);
  } else if (sourceExport !== undefined && sourceExport.sampleCount !== surface.sampleCount) {
    violations.push(`${surfaceLabel}: sampleCount must match sourceExports sampleCount`);
  }
  if (!Array.isArray(surface.safeDiagnosticFields) || surface.safeDiagnosticFields.length === 0) {
    violations.push(`${surfaceLabel}: safeDiagnosticFields must be a non-empty array`);
  }

  for (const field of surface.safeDiagnosticFields ?? []) {
    if (typeof field !== 'string' || field.trim().length === 0) {
      violations.push(`${surfaceLabel}: safeDiagnosticFields must contain non-empty strings`);
      continue;
    }
    const normalized = field.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (forbiddenArtifactKeys.has(normalized)) {
      violations.push(`${surfaceLabel}: unsafe diagnostic field "${field}"`);
    }
  }

  validateLeakClassResults(surface.leakClassResults, surfaceLabel, context);
}

function validateLeakClassResults(results, surfaceLabel, context) {
  const { requiredLeakClasses, violations } = context;
  if (!Array.isArray(results)) {
    violations.push(`${surfaceLabel}: leakClassResults must be an array`);
    return;
  }

  const resultIds = new Set();
  for (const [index, result] of results.entries()) {
    const resultLabel = `${surfaceLabel}.leakClassResults[${index}]`;
    if (result === null || typeof result !== 'object' || Array.isArray(result)) {
      violations.push(`${resultLabel}: result must be an object`);
      continue;
    }

    if (!requiredLeakClasses.has(result.leakClass)) {
      violations.push(`${resultLabel}: unsupported leakClass "${result.leakClass}"`);
    } else if (resultIds.has(result.leakClass)) {
      violations.push(`${resultLabel}: duplicate leakClass "${result.leakClass}"`);
    } else {
      resultIds.add(result.leakClass);
    }
    if (result.found !== false) {
      violations.push(`${resultLabel}: found must be false`);
    }
    if (!Number.isInteger(result.sampleCount) || result.sampleCount <= 0) {
      violations.push(`${resultLabel}: sampleCount must be a positive integer`);
    }
  }

  for (const leakClass of requiredLeakClasses) {
    if (!resultIds.has(leakClass)) {
      violations.push(`${surfaceLabel}: leakClassResults must include ${leakClass}`);
    }
  }
}

export function validateRequiredSourceExports(sourceExports, context) {
  const { requiredSourceExportEnvBySurface, evidencePath, violations } = context;
  if (!Array.isArray(sourceExports)) {
    violations.push(`${evidencePath}: deploySampleContentSchema.requiredSourceExports must be an array`);
    return;
  }

  const surfaceIds = new Set();
  for (const [index, sourceExport] of sourceExports.entries()) {
    const exportLabel = `deploySampleContentSchema.requiredSourceExports[${index}]`;
    if (sourceExport === null || typeof sourceExport !== 'object' || Array.isArray(sourceExport)) {
      violations.push(`${evidencePath}: ${exportLabel} must be an object`);
      continue;
    }
    const expectedEnv = requiredSourceExportEnvBySurface.get(sourceExport.surfaceId);
    if (expectedEnv === undefined) {
      violations.push(`${evidencePath}: ${exportLabel}.surfaceId is unsupported`);
      continue;
    }
    if (surfaceIds.has(sourceExport.surfaceId)) {
      violations.push(`${evidencePath}: duplicate required source export for "${sourceExport.surfaceId}"`);
    }
    surfaceIds.add(sourceExport.surfaceId);
    if (sourceExport.envVar !== expectedEnv) {
      violations.push(`${evidencePath}: ${exportLabel}.envVar must be ${expectedEnv}`);
    }
    if (sourceExport.pathRequired !== true) {
      violations.push(`${evidencePath}: ${exportLabel}.pathRequired must be true`);
    }
    if (sourceExport.sha256Required !== true) {
      violations.push(`${evidencePath}: ${exportLabel}.sha256Required must be true`);
    }
    if (sourceExport.redactedOnly !== true) {
      violations.push(`${evidencePath}: ${exportLabel}.redactedOnly must be true`);
    }
  }

  for (const surfaceId of requiredSourceExportEnvBySurface.keys()) {
    if (!surfaceIds.has(surfaceId)) {
      violations.push(`${evidencePath}: deploySampleContentSchema.requiredSourceExports must include ${surfaceId}`);
    }
  }
}

export function validateArtifactReview(review, path, context) {
  const { violations } = context;
  if (review === null || typeof review !== 'object' || Array.isArray(review)) {
    violations.push(`${path}: review must be an object`);
    return;
  }

  if (typeof review.reviewer !== 'string' || review.reviewer.trim().length === 0) {
    violations.push(`${path}: review.reviewer must be a non-empty string`);
  }
  if (review.decision !== 'passed') {
    violations.push(`${path}: review.decision must be passed`);
  }
  if (typeof review.notes !== 'string' || review.notes.trim().length < 20) {
    violations.push(`${path}: review.notes must explain the staging redaction review`);
  }
}
