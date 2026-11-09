import { isRecord, isIsoDateString } from './source-live-certification-evidence-shape.mjs';
import { validateEvidenceArtifactProvenance, validateRealEvidenceIdentityStrings } from './evidence-provenance.mjs';

// Caller owns artifact I/O, fixture marker scanning, and the violation sink.
// This policy only validates Reddit credential lifecycle artifacts.
export function createSourceLiveRedditCredentialPolicy({
  violations,
  redditCredentialLifecycleFormat,
  redditCredentialLifecycleEvidenceKind,
  requiredRedditLifecycleOperations,
  validateNoRealArtifactFixtureMarkers,
  validateNoSensitiveArtifactLiterals,
}) {
  function validateArtifactRedaction(artifact, label) {
    if (typeof artifact.redaction !== 'object' || artifact.redaction === null) {
      violations.push(`${label}: redaction object is required`);
      return;
    }
  
    for (const field of [
      'secretsIncluded',
      'rawProviderPayloadsIncluded',
      'credentialValuesIncluded',
      'privateNetworkUrlsIncluded',
    ]) {
      if (artifact.redaction[field] !== false) {
        violations.push(`${label}: redaction.${field} must be false`);
      }
    }
  }

  function validateRedditCredentialLifecycleArtifact(artifact, options) {
    const label = options.label;
  
    if (!isRecord(artifact)) {
      violations.push(`${label}: artifact must be an object`);
      return;
    }
    if (artifact.schemaVersion !== 1) {
      violations.push(`${label}: schemaVersion must be 1`);
    }
    if (artifact.format !== redditCredentialLifecycleFormat) {
      violations.push(`${label}: format must be ${redditCredentialLifecycleFormat}`);
    }
    for (const field of ['artifactId', 'environmentId', 'imageDigest', 'commitSha', 'operator', 'sampledAt']) {
      if (typeof artifact[field] !== 'string' || artifact[field].trim().length === 0) {
        violations.push(`${label}: ${field} must be a non-empty string`);
      }
    }
    if (!/^sha256:[0-9a-f]{64}$/.test(String(artifact.imageDigest ?? ''))) {
      violations.push(`${label}: imageDigest must be immutable sha256 digest`);
    }
    if (!/^[0-9a-f]{40}$/.test(String(artifact.commitSha ?? ''))) {
      violations.push(`${label}: commitSha must be a full git commit SHA`);
    }
    if (!isIsoDateString(artifact.sampledAt)) {
      violations.push(`${label}: sampledAt must be an ISO timestamp`);
    }
    if (options.allowFixture !== true) {
      validateRealEvidenceIdentityStrings({
        source: artifact,
        fields: ['environmentId', 'operator'],
        label,
        violations,
        realEvidenceLabel: 'reddit credential lifecycle artifacts',
      });
    }
    if (options.expectedEnvironmentId !== undefined && artifact.environmentId !== options.expectedEnvironmentId) {
      violations.push(`${label}: environmentId must match SOURCE_LIVE_ENVIRONMENT_ID`);
    }
    if (options.expectedImageDigest !== undefined && artifact.imageDigest !== options.expectedImageDigest) {
      violations.push(`${label}: imageDigest must match BACKEND_IMAGE_DIGEST`);
    }
    if (options.expectedCommitSha !== undefined && artifact.commitSha !== options.expectedCommitSha) {
      violations.push(`${label}: commitSha must match BACKEND_GIT_COMMIT_SHA`);
    }
    if (options.expectedOperator !== undefined && artifact.operator !== options.expectedOperator) {
      violations.push(`${label}: operator must match SOURCE_LIVE_OPERATOR`);
    }
  
    validateEvidenceArtifactProvenance({
      provenance: artifact.provenance,
      label,
      expectedEvidenceKind: redditCredentialLifecycleEvidenceKind,
      allowFixture: options.allowFixture === true,
      violations,
      realEvidenceLabel: 'reddit credential lifecycle artifacts',
    });
    validateArtifactRedaction(artifact, label);
    if (options.allowFixture !== true) {
      validateNoRealArtifactFixtureMarkers(artifact, label);
    }
    validateNoSensitiveArtifactLiterals(artifact, label);
    validateRedditCredentialLifecycleOperations(artifact.lifecycleOperations, label);
  }

  function validateRedditCredentialLifecycleOperations(operations, label) {
    if (!Array.isArray(operations) || operations.length === 0) {
      violations.push(`${label}: lifecycleOperations must be a non-empty array`);
      return;
    }
  
    const observedOperations = new Set();
    for (const [index, operation] of operations.entries()) {
      const operationLabel = `${label}: lifecycleOperations[${index}]`;
      if (!isRecord(operation)) {
        violations.push(`${operationLabel} must be an object`);
        continue;
      }
      if (typeof operation.operation !== 'string' || operation.operation.trim().length === 0) {
        violations.push(`${operationLabel}.operation must be a non-empty string`);
      } else {
        observedOperations.add(operation.operation);
        if (!requiredRedditLifecycleOperations.has(operation.operation)) {
          violations.push(`${operationLabel}.operation is unsupported`);
        }
      }
      if (operation.status !== 'passed') {
        violations.push(`${operationLabel}.status must be passed`);
      }
      if (typeof operation.observedAt !== 'string' || operation.observedAt.trim().length === 0) {
        violations.push(`${operationLabel}.observedAt must be a non-empty string`);
      } else if (!isIsoDateString(operation.observedAt)) {
        violations.push(`${operationLabel}.observedAt must be an ISO timestamp`);
      }
      if (!isRecord(operation.evidence)) {
        violations.push(`${operationLabel}.evidence must be an object`);
      } else {
        if (typeof operation.evidence.summary !== 'string' || operation.evidence.summary.trim().length === 0) {
          violations.push(`${operationLabel}.evidence.summary must be a non-empty string`);
        }
        if (operation.evidence.secretValuesRedacted !== true) {
          violations.push(`${operationLabel}.evidence.secretValuesRedacted must be true`);
        }
        if (operation.evidence.auditEventRecorded !== true) {
          violations.push(`${operationLabel}.evidence.auditEventRecorded must be true`);
        }
      }
    }
  
    for (const operation of requiredRedditLifecycleOperations) {
      if (!observedOperations.has(operation)) {
        violations.push(`${label}: lifecycleOperations must include ${operation}`);
      }
    }
  }

  return {
    validateArtifactRedaction,
    validateRedditCredentialLifecycleArtifact,
    validateRedditCredentialLifecycleOperations,
  };
}
