export const fixtureEvidenceKind = 'fixture_example';
export const requiredEvidenceProvenanceFields = new Set(['evidenceKind', 'collectionMethod', 'runner', 'fixtureOnly']);
export const forbiddenRealEvidenceProvenanceFragments = [
  'example',
  'fixture',
  'synthetic',
  'mock',
  'test',
];

export function validateEvidenceProvenanceRequirements({
  requirements,
  expectedEvidenceKind,
  label,
  sourcePath,
  violations,
  requiredFields = requiredEvidenceProvenanceFields,
  forbiddenRealFragments = forbiddenRealEvidenceProvenanceFragments,
}) {
  if (!isRecord(requirements)) {
    violations.push(`${sourcePath}: ${label} is required`);
    return;
  }
  if (requirements.evidenceKind !== expectedEvidenceKind) {
    violations.push(`${sourcePath}: ${label}.evidenceKind must be ${expectedEvidenceKind}`);
  }
  if (requirements.fixtureOnly !== false) {
    violations.push(`${sourcePath}: ${label}.fixtureOnly must be false`);
  }
  requireSetCoverage(
    new Set(requirements.requiredFields ?? []),
    requiredFields,
    `${label}.requiredFields`,
    sourcePath,
    violations,
  );
  requireSetCoverage(
    new Set(requirements.forbiddenRealFragments ?? []),
    new Set(forbiddenRealFragments),
    `${label}.forbiddenRealFragments`,
    sourcePath,
    violations,
  );
}

export function validateEvidenceArtifactProvenance({
  provenance,
  label,
  expectedEvidenceKind,
  allowFixture = false,
  violations,
  realEvidenceLabel = 'evidence artifacts',
  requiredFields = requiredEvidenceProvenanceFields,
  forbiddenRealFragments = forbiddenRealEvidenceProvenanceFragments,
}) {
  if (!isRecord(provenance)) {
    violations.push(`${label}: provenance must be an object`);
    return;
  }

  for (const field of requiredFields) {
    if (!(field in provenance)) {
      violations.push(`${label}: provenance.${field} is required`);
    }
  }
  for (const field of ['evidenceKind', 'collectionMethod', 'runner']) {
    if (typeof provenance[field] !== 'string' || provenance[field].trim().length === 0) {
      violations.push(`${label}: provenance.${field} must be a non-empty string`);
    }
  }

  if (allowFixture === true) {
    if (provenance.evidenceKind !== fixtureEvidenceKind) {
      violations.push(`${label}: fixture provenance.evidenceKind must be ${fixtureEvidenceKind}`);
    }
    if (provenance.fixtureOnly !== true) {
      violations.push(`${label}: fixture provenance.fixtureOnly must be true`);
    }
    return;
  }

  if (provenance.evidenceKind !== expectedEvidenceKind) {
    violations.push(`${label}: provenance.evidenceKind must be ${expectedEvidenceKind}`);
  }
  if (provenance.fixtureOnly !== false) {
    violations.push(`${label}: provenance.fixtureOnly must be false for ${realEvidenceLabel}`);
  }
  for (const field of ['evidenceKind', 'collectionMethod', 'runner']) {
    validateRealProvenanceString({
      value: provenance[field],
      label: `${label}: provenance.${field}`,
      realEvidenceLabel,
      forbiddenRealFragments,
      violations,
    });
  }
}

function validateRealProvenanceString({
  value,
  label,
  realEvidenceLabel,
  forbiddenRealFragments,
  violations,
}) {
  if (typeof value !== 'string') {
    return;
  }

  const normalized = value.toLowerCase();
  for (const fragment of forbiddenRealFragments) {
    if (normalized.includes(fragment)) {
      violations.push(`${label} must not contain "${fragment}" for ${realEvidenceLabel}`);
    }
  }
}

function requireSetCoverage(actual, expected, label, sourcePath, violations) {
  for (const expectedValue of expected) {
    if (!actual.has(expectedValue)) {
      violations.push(`${sourcePath}: ${label} must include "${expectedValue}"`);
    }
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
