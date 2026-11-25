/** Recursively reject sensitive artifact field names, retaining diagnostic order. */
export function scanForbiddenArtifactKeys(value, label, context) {
  const { forbiddenArtifactKeys, violations } = context;
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      scanForbiddenArtifactKeys(item, `${label}[${index}]`, context);
    }
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (forbiddenArtifactKeys.has(normalizedKey)) {
      violations.push(`${label}: forbidden sensitive field "${key}"`);
    }
    scanForbiddenArtifactKeys(nested, `${label}.${key}`, context);
  }
}


/** Reject example/fixture markers in real artifact data, retaining field paths. */
export function validateNoRealArtifactFixtureMarkers(value, label, context, path = []) {
  const { forbiddenRealArtifactMarkerPattern, violations } = context;
  if (typeof value === 'string') {
    const marker = forbiddenRealArtifactMarkerPattern.exec(value);
    if (marker !== null) {
      const fieldPath = path.length === 0 ? '<root>' : path.join('.');
      violations.push(`${label}: ${fieldPath} must not contain fixture marker "${marker[1]}"`);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      validateNoRealArtifactFixtureMarkers(item, label, context, [...path, `[${index}]`]);
    }
    return;
  }

  if (value === null || typeof value !== 'object') {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    validateNoRealArtifactFixtureMarkers(item, label, context, [...path, key]);
  }
}

