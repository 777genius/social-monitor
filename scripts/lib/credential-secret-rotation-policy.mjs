import { validateRealEvidenceIdentityStrings } from './evidence-provenance.mjs';

// Deterministic credential-rotation artifact field policies; the checker owns
// its configuration, diagnostics array, evidence paths and runtime flow.
export function validateArtifactEnvironment(environment, path, options, context) {
  const { isIsoDateString, violations } = context;
  if (environment === null || typeof environment !== 'object' || Array.isArray(environment)) {
    violations.push(`${path}: environment must be an object`);
    return;
  }

  for (const field of ['environmentId', 'secretStoreId', 'sampledAt', 'operator']) {
    if (typeof environment[field] !== 'string' || environment[field].trim().length === 0) {
      violations.push(`${path}: environment.${field} must be a non-empty string`);
    }
  }
  if (!isIsoDateString(environment.sampledAt)) {
    violations.push(`${path}: environment.sampledAt must be an ISO timestamp`);
  }
  if (options.allowExample !== true) {
    validateRealEvidenceIdentityStrings({
      source: environment,
      fields: ['environmentId', 'secretStoreId', 'operator'],
      label: `${path}: environment`,
      violations,
      realEvidenceLabel: 'rotation evidence',
    });
  }

  const expected = options.expectedEvidence;
  if (expected !== undefined) {
    for (const field of ['secretStoreId', 'sampledAt']) {
      if (expected[field] !== undefined && environment[field] !== expected[field]) {
        violations.push(`${path}: environment.${field} must match rotationEvidence.${field}`);
      }
    }
  }
}

export function validateArtifactRedaction(redaction, path, context) {
  const { requiredRotationRedactionFlags, violations } = context;
  if (redaction === null || typeof redaction !== 'object' || Array.isArray(redaction)) {
    violations.push(`${path}: redaction must be an object`);
    return;
  }

  for (const [field, expected] of Object.entries(requiredRotationRedactionFlags)) {
    if (redaction[field] !== expected) {
      violations.push(`${path}: redaction.${field} must be ${expected}`);
    }
  }
  if (typeof redaction.method !== 'string' || redaction.method.trim().length < 20) {
    violations.push(`${path}: redaction.method must explain the redaction process`);
  }
}

export function validateArtifactOperations(operations, path, options, context) {
  const { requiredRotationOperations, violations } = context;
  if (!Array.isArray(operations)) {
    violations.push(`${path}: operations must be an array`);
    return;
  }

  const operationIds = new Set();
  for (const [index, operation] of operations.entries()) {
    validateArtifactOperation(operation, `${path}: operations[${index}]`, operationIds, options, context);
  }

  const requiredOperations = requiredRotationOperations[options.schemaKey] ?? new Set();
  for (const operationId of requiredOperations) {
    if (!operationIds.has(operationId)) {
      violations.push(`${path}: operations must include ${operationId}`);
    }
  }
}

function validateArtifactOperation(operation, label, operationIds, options, context) {
  const { requiredRotationOperations, isIsoDateString, violations } = context;
  if (operation === null || typeof operation !== 'object' || Array.isArray(operation)) {
    violations.push(`${label}: operation must be an object`);
    return;
  }

  const requiredOperations = requiredRotationOperations[options.schemaKey] ?? new Set();
  if (!requiredOperations.has(operation.operationId)) {
    violations.push(`${label}: unsupported operationId "${operation.operationId}"`);
  } else if (operationIds.has(operation.operationId)) {
    violations.push(`${label}: duplicate operationId "${operation.operationId}"`);
  } else {
    operationIds.add(operation.operationId);
  }
  if (operation.status !== 'passed') {
    violations.push(`${label}: status must be passed`);
  }
  if (!isIsoDateString(operation.observedAt)) {
    violations.push(`${label}: observedAt must be an ISO timestamp`);
  }
  if (operation.secretClass !== options.expectedSecretClass) {
    violations.push(`${label}: secretClass must be ${options.expectedSecretClass}`);
  }
  for (const field of ['keyIdBefore', 'keyIdAfter']) {
    if (typeof operation[field] !== 'string' || operation[field].trim().length === 0) {
      violations.push(`${label}: ${field} must be a non-empty string`);
    }
  }
  if (
    ['reencrypt-with-new-key-id', 'new-key-signs', 'old-key-rejected-after-rotation'].includes(operation.operationId)
    && operation.keyIdBefore === operation.keyIdAfter
  ) {
    violations.push(`${label}: ${operation.operationId} must change key id`);
  }

  validateSafeEvidence(operation.safeEvidence, label, operation.operationId, context);
}

function validateSafeEvidence(safeEvidence, label, operationId, context) {
  const { violations } = context;
  if (safeEvidence === null || typeof safeEvidence !== 'object' || Array.isArray(safeEvidence)) {
    violations.push(`${label}: safeEvidence must be an object`);
    return;
  }

  if (safeEvidence.plaintextObserved !== false) {
    violations.push(`${label}: safeEvidence.plaintextObserved must be false`);
  }
  if (safeEvidence.previewContainsSecretValue !== false) {
    violations.push(`${label}: safeEvidence.previewContainsSecretValue must be false`);
  }
  if (operationId === 'new-key-signs' && safeEvidence.signatureVerified !== true) {
    violations.push(`${label}: new-key-signs must have signatureVerified=true`);
  }
  if (operationId === 'old-key-rejected-after-rotation' && safeEvidence.signatureVerified !== false) {
    violations.push(`${label}: old-key-rejected-after-rotation must have signatureVerified=false`);
  }
  if (['decrypt-with-current-key', 'reencrypt-with-new-key-id', 'preview-redaction-proof'].includes(operationId)) {
    for (const field of ['credentialRecordId', 'provider']) {
      if (typeof safeEvidence[field] !== 'string' || safeEvidence[field].trim().length === 0) {
        violations.push(`${label}: ${operationId} safeEvidence.${field} must be a non-empty string`);
      }
    }
  }
  if (['new-key-signs', 'old-key-rejected-after-rotation', 'delivery-preview-redaction-proof'].includes(operationId)) {
    if (typeof safeEvidence.webhookEndpointId !== 'string' || safeEvidence.webhookEndpointId.trim().length === 0) {
      violations.push(`${label}: ${operationId} safeEvidence.webhookEndpointId must be a non-empty string`);
    }
  }
}

export function validateArtifactRollup(rollup, path, context) {
  const { violations } = context;
  if (rollup === null || typeof rollup !== 'object' || Array.isArray(rollup)) {
    violations.push(`${path}: rollup must be an object`);
    return;
  }
  if (rollup.rotationPassed !== true) {
    violations.push(`${path}: rollup.rotationPassed must be true`);
  }
  if (rollup.redactionPassed !== true) {
    violations.push(`${path}: rollup.redactionPassed must be true`);
  }
  if (rollup.plaintextObserved !== false) {
    violations.push(`${path}: rollup.plaintextObserved must be false`);
  }
}
