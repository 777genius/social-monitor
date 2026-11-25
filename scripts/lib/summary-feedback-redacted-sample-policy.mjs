// Pure summary-feedback redacted-sample policy. No IO or secrets at module import.
// Caller retains complete validation rules, evidence paths and IO callbacks.
export function validateArtifactProvenance(provenance, path, options, context) {
  const { redactedSampleEvidenceKind, validateEvidenceArtifactProvenance, violations } = context;

  validateEvidenceArtifactProvenance({
    provenance,
    label: path,
    expectedEvidenceKind: redactedSampleEvidenceKind,
    allowFixture: options.allowExample === true,
    violations,
    realEvidenceLabel: 'real feedback artifacts',
  });
}

export function validateSampleSource(source, path, options, context) {
  const { allowedRealSampleSourceKinds, validateRealEvidenceIdentityStrings, forbiddenRealSourceFragments, isIsoDateString, violations } = context;

  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    violations.push(`${path}: source must be an object`);
    return;
  }
  for (const field of ['kind', 'environmentId', 'operator', 'collectionMethod', 'redactedBy', 'approvedBy']) {
    if (typeof source[field] !== 'string' || source[field].trim().length === 0) {
      violations.push(`${path}: source.${field} must be a non-empty string`);
    }
  }
  if (options.allowExample !== true) {
    if (!allowedRealSampleSourceKinds.has(source.kind)) {
      violations.push(`${path}: real sample source.kind must be one of ${[...allowedRealSampleSourceKinds].join(', ')}`);
    }
    validateRealEvidenceIdentityStrings({
      source,
      fields: ['kind', 'environmentId', 'operator', 'collectionMethod', 'redactedBy', 'approvedBy'],
      label: `${path}: source`,
      violations,
      realEvidenceLabel: 'real feedback artifacts',
      forbiddenRealFragments: forbiddenRealSourceFragments,
    });
    if (typeof source.collectionMethod === 'string' && source.collectionMethod.trim().length < 20) {
      violations.push(`${path}: source.collectionMethod must describe the real export path`);
    }
  }
  if (!Number.isInteger(source.sampleCount) || source.sampleCount <= 0) {
    violations.push(`${path}: source.sampleCount must be a positive integer`);
  }
  if (!isIsoDateString(source.sampleWindow?.startedAt) || !isIsoDateString(source.sampleWindow?.endedAt)) {
    violations.push(`${path}: source.sampleWindow must include ISO startedAt and endedAt`);
  } else if (Date.parse(source.sampleWindow.startedAt) >= Date.parse(source.sampleWindow.endedAt)) {
    violations.push(`${path}: source.sampleWindow.startedAt must be before endedAt`);
  }
  validateSourceExport(source.export, path, options, context);
}

function validateSourceExport(sourceExport, path, options, context) {
  const { validateRealEvidenceIdentityStrings, forbiddenRealSourceFragments, isIsoDateString, violations } = context;

  if (sourceExport === null || typeof sourceExport !== 'object' || Array.isArray(sourceExport)) {
    violations.push(`${path}: source.export must be an object`);
    return;
  }

  for (const field of ['sourceSystem', 'exportId', 'reviewQueue', 'redactionReviewId', 'approvalReference']) {
    if (typeof sourceExport[field] !== 'string' || sourceExport[field].trim().length < 4) {
      violations.push(`${path}: source.export.${field} must be a non-empty traceability string`);
    }
  }
  if (!isIsoDateString(sourceExport.exportedAt)) {
    violations.push(`${path}: source.export.exportedAt must be an ISO timestamp`);
  }

  if (options.allowExample === true) {
    return;
  }

  validateRealEvidenceIdentityStrings({
    source: sourceExport,
    fields: ['sourceSystem', 'exportId', 'reviewQueue', 'redactionReviewId', 'approvalReference'],
    label: `${path}: source.export`,
    violations,
    realEvidenceLabel: 'real feedback artifacts',
    forbiddenRealFragments: forbiddenRealSourceFragments,
  });
}

export function validateSampleRedaction(redaction, path, context) {
  const { requiredSampleRedactionFlags, violations } = context;

  if (redaction === null || typeof redaction !== 'object' || Array.isArray(redaction)) {
    violations.push(`${path}: redaction must be an object`);
    return;
  }

  for (const [field, expected] of Object.entries(requiredSampleRedactionFlags)) {
    if (redaction[field] !== expected) {
      violations.push(`${path}: redaction.${field} must be ${expected}`);
    }
  }

  if (typeof redaction.method !== 'string' || redaction.method.trim().length < 20) {
    violations.push(`${path}: redaction.method must describe how comments and identifiers were redacted`);
  }
}

export function validateSampleRollup(rollup, path, sampleCount, blockerIdsFromSamples, rollupInput, context) {
  const { violations } = context;

  if (rollup === null || typeof rollup !== 'object' || Array.isArray(rollup)) {
    violations.push(`${path}: rollup must be an object`);
    return;
  }

  if (rollup.sampleCount !== sampleCount) {
    violations.push(`${path}: rollup.sampleCount must match samples.length`);
  }
  validateCountObject(rollup.categoryCounts, rollupInput.categoryCounts, `${path}: rollup.categoryCounts`, context);
  validateCountObject(rollup.classificationCounts, rollupInput.classificationCounts, `${path}: rollup.classificationCounts`, context);
  validateCountObject(rollup.severityCounts, rollupInput.severityCounts, `${path}: rollup.severityCounts`, context);
  validateCountObject(rollup.actionTypeCounts, rollupInput.actionTypeCounts, `${path}: rollup.actionTypeCounts`, context);

  if (rollup.releaseBlockingSamples !== rollupInput.releaseBlockingSamples) {
    violations.push(`${path}: rollup.releaseBlockingSamples must match releaseBlocking samples`);
  }
  if (rollup.evalFixtureEligibleSamples !== rollupInput.evalFixtureEligibleSamples) {
    violations.push(`${path}: rollup.evalFixtureEligibleSamples must match eligibleForEvalFixture samples`);
  }

  if (!Array.isArray(rollup.blockerSampleIds)) {
    violations.push(`${path}: rollup.blockerSampleIds must be an array`);
  } else {
    const actualBlockerIds = new Set(rollup.blockerSampleIds);
    if (actualBlockerIds.size !== rollup.blockerSampleIds.length) {
      violations.push(`${path}: rollup.blockerSampleIds must not contain duplicates`);
    }
    for (const blockerId of blockerIdsFromSamples) {
      if (!actualBlockerIds.has(blockerId)) {
        violations.push(`${path}: rollup.blockerSampleIds missing "${blockerId}"`);
      }
    }
    for (const blockerId of actualBlockerIds) {
      if (!blockerIdsFromSamples.has(blockerId)) {
        violations.push(`${path}: rollup.blockerSampleIds contains non-blocker sample "${blockerId}"`);
      }
    }
  }
}

function validateCountObject(actual, expected, label, context) {
  const { violations } = context;

  if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) {
    violations.push(`${label} must be an object`);
    return;
  }

  for (const [key, expectedCount] of expected.entries()) {
    if (actual[key] !== expectedCount) {
      violations.push(`${label}.${key} must be ${expectedCount}`);
    }
  }
  for (const key of Object.keys(actual)) {
    if (!expected.has(key)) {
      violations.push(`${label}.${key} is not present in samples`);
    }
  }
}

export function incrementCount(counts, key) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

export function validateRedactedSample(sample, sampleLabel, sampleIds, context) {
  const { allowedSampleCategories, allowedSampleClassifications, allowedSampleSeverities, violations } = context;

  if (sample === null || typeof sample !== 'object' || Array.isArray(sample)) {
    violations.push(`${sampleLabel}: sample must be an object`);
    return;
  }

  scanForbiddenSampleKeys(sample, sampleLabel, context);

  if (typeof sample.feedbackId !== 'string' || sample.feedbackId.trim().length === 0) {
    violations.push(`${sampleLabel}: feedbackId must be a non-empty string`);
  } else if (sampleIds.has(sample.feedbackId)) {
    violations.push(`${sampleLabel}: duplicate feedbackId "${sample.feedbackId}"`);
  } else {
    sampleIds.add(sample.feedbackId);
  }

  if (!allowedSampleCategories.has(sample.category)) {
    violations.push(`${sampleLabel}: unsupported category "${sample.category}"`);
  }
  if (!allowedSampleClassifications.has(sample.classification)) {
    violations.push(`${sampleLabel}: unsupported classification "${sample.classification}"`);
  }
  if (!allowedSampleSeverities.has(sample.severity)) {
    violations.push(`${sampleLabel}: unsupported severity "${sample.severity}"`);
  }
  if (typeof sample.triageOwner !== 'string' || sample.triageOwner.trim().length === 0) {
    violations.push(`${sampleLabel}: triageOwner must be a non-empty string`);
  }
  if (typeof sample.eligibleForEvalFixture !== 'boolean') {
    violations.push(`${sampleLabel}: eligibleForEvalFixture must be boolean`);
  }
  if (sample.releaseBlocking !== true) {
    violations.push(`${sampleLabel}: releaseBlocking must be true`);
  }

  validateSummaryEvidence(sample.summaryEvidence, sample.category, sampleLabel, context);
  validateSanitizedText(sample.sanitizedSignal, `${sampleLabel}.sanitizedSignal`, 20, context);
  validateSanitizedText(sample.redactedComment, `${sampleLabel}.redactedComment`, 20, context);
  validateQualitySignals(sample.qualitySignals, sampleLabel, context);
  validateSampleHardeningAction(sample, sampleLabel, context);
}

export function validateRealSampleDoesNotCopyFixtureExample(sample, sampleLabel, context) {
  const { knownFixtureSampleGuards, sampleSignalFingerprint, violations } = context;

  const feedbackId = typeof sample.feedbackId === 'string' ? sample.feedbackId.trim() : '';
  if (knownFixtureSampleGuards.feedbackIds.has(feedbackId)) {
    violations.push(`${sampleLabel}: real feedback sample must not reuse fixture sample id "${feedbackId}"`);
  }

  const fingerprint = sampleSignalFingerprint(sample);
  if (fingerprint !== undefined && knownFixtureSampleGuards.signalFingerprints.has(fingerprint)) {
    violations.push(`${sampleLabel}: real feedback sample must not copy fixture sample signal text`);
  }
}

function validateSummaryEvidence(summaryEvidence, category, sampleLabel, context) {
  const { violations } = context;

  if (summaryEvidence === null || typeof summaryEvidence !== 'object' || Array.isArray(summaryEvidence)) {
    violations.push(`${sampleLabel}: summaryEvidence must be an object`);
    return;
  }

  for (const field of ['summaryId', 'interestId']) {
    if (typeof summaryEvidence[field] !== 'string' || summaryEvidence[field].trim().length === 0) {
      violations.push(`${sampleLabel}: summaryEvidence.${field} must be a non-empty string`);
    }
  }

  if (['wrong_fact', 'missing_source', 'bad_citation'].includes(category)) {
    for (const field of ['citationId', 'feedItemId', 'sourceItemId', 'providerKey']) {
      if (typeof summaryEvidence[field] !== 'string' || summaryEvidence[field].trim().length === 0) {
        violations.push(`${sampleLabel}: summaryEvidence.${field} is required for ${category}`);
      }
    }
  }
}

function validateSanitizedText(value, label, minimumLength, context) {
  const { forbiddenSerializedFragments, violations } = context;

  if (typeof value !== 'string' || value.trim().length < minimumLength) {
    violations.push(`${label} must be a redacted string with at least ${minimumLength} characters`);
    return;
  }

  const normalized = value.toLowerCase();
  for (const fragment of forbiddenSerializedFragments) {
    if (normalized.includes(fragment)) {
      violations.push(`${label} must not contain "${fragment}"`);
    }
  }
}

function validateQualitySignals(qualitySignals, sampleLabel, context) {
  const { requiredSampleSignals, violations } = context;

  if (qualitySignals === null || typeof qualitySignals !== 'object' || Array.isArray(qualitySignals)) {
    violations.push(`${sampleLabel}: qualitySignals must be an object`);
    return;
  }

  for (const signal of requiredSampleSignals) {
    if (qualitySignals[signal] !== true) {
      violations.push(`${sampleLabel}: qualitySignals.${signal} must be true`);
    }
  }
}

function validateSampleHardeningAction(sample, sampleLabel, context) {
  const { allowedActionTypes, validateCommand, requireExistingPath, evalFixtureIds, costFixtureIds, evalOutputPath, costPath, violations } = context;

  const action = sample.hardeningAction;
  if (action === null || typeof action !== 'object' || Array.isArray(action)) {
    violations.push(`${sampleLabel}: hardeningAction must be an object`);
    return;
  }

  if (!allowedActionTypes.has(action.actionType)) {
    violations.push(`${sampleLabel}: hardeningAction has unsupported actionType "${action.actionType}"`);
  }
  if (action.status !== 'passed') {
    violations.push(`${sampleLabel}: hardeningAction.status must be passed for redacted samples`);
  }
  validateCommand(action.command, `${sampleLabel} hardeningAction`);
  requireExistingPath(action.artifact, `${sampleLabel} hardeningAction artifact`);
  if (typeof action.exitCondition !== 'string' || action.exitCondition.trim().length === 0) {
    violations.push(`${sampleLabel}: hardeningAction.exitCondition must be a non-empty string`);
  }

  const fixtureIds = action.fixtureIds ?? [];
  if (!Array.isArray(fixtureIds)) {
    violations.push(`${sampleLabel}: hardeningAction.fixtureIds must be an array`);
    return;
  }
  if (action.actionType === 'eval_fixture' && fixtureIds.length === 0) {
    violations.push(`${sampleLabel}: eval_fixture hardeningAction must reference at least one fixture`);
  }

  for (const fixtureId of fixtureIds) {
    if (!evalFixtureIds.has(fixtureId)) {
      violations.push(`${evalOutputPath}: ${sampleLabel} references missing fixture "${fixtureId}"`);
    }
    if (!costFixtureIds.has(fixtureId)) {
      violations.push(`${costPath}: ${sampleLabel} references fixture without cost row "${fixtureId}"`);
    }
  }

  if (sample.classification === 'blocker' && !allowedActionTypes.has(action.actionType)) {
    violations.push(`${sampleLabel}: blocker sample must map to eval, validator or runbook action`);
  }
}

function scanForbiddenSampleKeys(value, label, context) {
  const { forbiddenSampleKeys, violations } = context;

  if (value === null || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      scanForbiddenSampleKeys(item, `${label}[${index}]`, context);
    }
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (forbiddenSampleKeys.has(normalizedKey)) {
      violations.push(`${label}: forbidden sensitive field "${key}"`);
    }
    scanForbiddenSampleKeys(nested, `${label}.${key}`, context);
  }
}

export function validateSerializedArtifact(artifact, path, context) {

  validateSerializedArtifactContent(JSON.stringify(artifact), path, context);
}

export function validateSerializedArtifactContent(content, path, context) {
  const { forbiddenSerializedFragments, validateSerializedPatterns, violations } = context;

  const serializedArtifact = content.toLowerCase();
  for (const fragment of forbiddenSerializedFragments) {
    if (serializedArtifact.includes(fragment)) {
      violations.push(`${path}: redacted sample artifact must not contain "${fragment}"`);
    }
  }
  validateSerializedPatterns(content, `${path}: redacted sample artifact`);
}
