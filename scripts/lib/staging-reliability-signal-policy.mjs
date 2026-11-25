import {
  hasNonEmptyEvidence,
  getPath,
  matchesEvidenceType,
  parseIsoTimestampMs,
  isSupportedEvidenceType,
  isRecord,
  objectsEqual,
} from './staging-reliability-evidence-shape.mjs';

// Deterministic staging evidence signal contract policy. The checker owns
// artifact acquisition, schema expectations and caller-collected diagnostics.
export function validateSignalResults(content, artifact, signals, context) {
  const { violations } = context;
  if (!Array.isArray(content.signalResults)) {
    violations.push(`${artifact.path}: signalResults must be an array`);
    return;
  }

  const expectedSignalIds = new Set(signals.map((signal) => signal.signalId));
  const resultBySignalId = new Map();
  for (const result of content.signalResults) {
    if (!isRecord(result)) {
      violations.push(
        `${artifact.path}: every signalResults item must be an object`,
      );
      continue;
    }
    if (resultBySignalId.has(result.signalId)) {
      violations.push(
        `${artifact.path}: duplicate signal result "${result.signalId}"`,
      );
    }
    resultBySignalId.set(result.signalId, result);
    if (!expectedSignalIds.has(result.signalId)) {
      violations.push(
        `${artifact.path}: unsupported signal result "${result.signalId}" for ${artifact.artifactId}`,
      );
    }
    if (result.status !== "passed") {
      violations.push(
        `${artifact.path}: signal result "${result.signalId}" must have status=passed`,
      );
    }
    if (
      typeof result.observedAt !== "string" ||
      result.observedAt.trim().length === 0
    ) {
      violations.push(
        `${artifact.path}: signal result "${result.signalId}" must define observedAt`,
      );
    } else if (!matchesEvidenceType(result.observedAt, "iso_timestamp")) {
      violations.push(
        `${artifact.path}: signal result "${result.signalId}" observedAt must be an ISO timestamp`,
      );
    } else {
      validateSignalObservedAtWindow(artifact, result, context);
    }
    if (!hasNonEmptyEvidence(result.evidence)) {
      violations.push(
        `${artifact.path}: signal result "${result.signalId}" must include non-empty evidence`,
      );
    } else {
      validateSignalEvidenceShape(artifact.path, result, context);
    }
  }

  for (const signal of signals) {
    if (!resultBySignalId.has(signal.signalId)) {
      violations.push(
        `${artifact.path}: missing signal result "${signal.signalId}" for ${artifact.artifactId}`,
      );
    }
  }
}

export function validateSignalEvidenceSchemaMap(context) {
  const { requiredSignalIds, requiredEvidenceShapeBySignalId, evidencePath, violations } = context;
  for (const signalId of requiredSignalIds) {
    const shape = requiredEvidenceShapeBySignalId.get(signalId);
    if (!Array.isArray(shape) || shape.length === 0) {
      violations.push(
        `${evidencePath}: missing signal-specific evidence schema for "${signalId}"`,
      );
      continue;
    }

    const seenFields = new Set();
    for (const [fieldPath, fieldType] of shape) {
      if (typeof fieldPath !== "string" || fieldPath.trim().length === 0) {
        violations.push(
          `${evidencePath}: evidence schema for "${signalId}" has an empty field path`,
        );
      }
      if (seenFields.has(fieldPath)) {
        violations.push(
          `${evidencePath}: evidence schema for "${signalId}" duplicates field "${fieldPath}"`,
        );
      }
      seenFields.add(fieldPath);
      if (!isSupportedEvidenceType(fieldType)) {
        violations.push(
          `${evidencePath}: evidence schema for "${signalId}" uses unsupported type "${fieldType}"`,
        );
      }
    }
  }

  for (const signalId of requiredEvidenceShapeBySignalId.keys()) {
    if (!requiredSignalIds.has(signalId)) {
      violations.push(
        `${evidencePath}: evidence schema references unsupported signal "${signalId}"`,
      );
    }
  }
}

function validateSignalEvidenceShape(artifactPath, result, context) {
  const { requiredEvidenceShapeBySignalId, violations } = context;
  const shape = requiredEvidenceShapeBySignalId.get(result.signalId);
  if (shape === undefined) {
    violations.push(
      `${artifactPath}: signal result "${result.signalId}" has no evidence schema`,
    );
    return;
  }
  if (!isRecord(result.evidence)) {
    violations.push(
      `${artifactPath}: signal result "${result.signalId}" evidence must be an object`,
    );
    return;
  }

  for (const [fieldPath, fieldType] of shape) {
    const value = getPath(result.evidence, fieldPath);
    if (value === undefined) {
      violations.push(
        `${artifactPath}: signal result "${result.signalId}" evidence must include ${fieldPath}`,
      );
      continue;
    }
    if (!matchesEvidenceType(value, fieldType)) {
      violations.push(
        `${artifactPath}: signal result "${result.signalId}" evidence.${fieldPath} must be ${fieldType}`,
      );
    }
  }
  if (result.signalId === "backend-loop-scheduled-scan") {
    validateScheduledScanEvidence(artifactPath, result.evidence, context);
  }
  if (result.signalId === "backend-loop-auto-summary-scheduler") {
    validateAutoSummaryEvidence(artifactPath, result.evidence, context);
  }
  if (result.signalId === "backend-loop-topic-to-delivery-audit") {
    validateDurableBackendProviderCoverage(artifactPath, result.evidence, context);
  }
  if (result.signalId === "backend-loop-reader-brief") {
    validateReaderBriefProviderCoverage(artifactPath, result.evidence, context);
  }
  if (result.signalId === "rabbitmq-consumer-ack") {
    validateRabbitMqAckEvidence(artifactPath, result.evidence, context);
  }
  if (result.signalId === "postgres-outbox-inbox-idempotency") {
    validatePostgresReplayStateEvidence(artifactPath, result.evidence, context);
  }
  if (result.signalId === "postgres-no-duplicate-side-effects") {
    validatePostgresNoDuplicateEvidence(artifactPath, result.evidence, context);
  }
}

function validateDurableBackendProviderCoverage(artifactPath, evidenceValue, context) {
  const { violations } = context;
  const values = getPath(evidenceValue, "providerFeedCounts");
  if (!Array.isArray(values)) {
    return;
  }
  const providerKeys = new Set(
    values
      .map((item) => (isRecord(item) ? item.providerKey : undefined))
      .filter((value) => typeof value === "string" && value.trim().length > 0),
  );
  for (const providerKey of [
    "github-issues",
    "github-trending-page",
    "hacker-news",
    "reddit",
    "rss",
  ]) {
    if (!providerKeys.has(providerKey)) {
      violations.push(
        `${artifactPath}: signal result "backend-loop-topic-to-delivery-audit" must include ${providerKey} provider feed evidence`,
      );
    }
  }
}

function validateReaderBriefProviderCoverage(artifactPath, evidenceValue, context) {
  const { violations } = context;
  const sourceMixProviderKeys = getPath(
    evidenceValue,
    "readerBrief.sourceMixProviderKeys",
  );
  const citationProviderKeys = getPath(
    evidenceValue,
    "readerBrief.citationProviderKeys",
  );
  for (const providerKey of [
    "github-issues",
    "github-trending-page",
    "hacker-news",
    "reddit",
    "rss",
  ]) {
    if (
      Array.isArray(sourceMixProviderKeys) &&
      !sourceMixProviderKeys.includes(providerKey)
    ) {
      violations.push(
        `${artifactPath}: signal result "backend-loop-reader-brief" must include ${providerKey} in readerBrief.sourceMixProviderKeys`,
      );
    }
    if (
      Array.isArray(citationProviderKeys) &&
      !citationProviderKeys.includes(providerKey)
    ) {
      violations.push(
        `${artifactPath}: signal result "backend-loop-reader-brief" must include ${providerKey} in readerBrief.citationProviderKeys`,
      );
    }
  }
}

function validateScheduledScanEvidence(artifactPath, evidenceValue, context) {
  const { violations } = context;
  const completedAtMs = parseIsoTimestampMs(
    getPath(evidenceValue, "scheduledScan.completedAt"),
  );
  const nextRunAtMs = parseIsoTimestampMs(
    getPath(evidenceValue, "scheduledScan.nextRunAtAfterSchedule"),
  );
  if (
    completedAtMs !== undefined &&
    nextRunAtMs !== undefined &&
    nextRunAtMs <= completedAtMs
  ) {
    violations.push(
      `${artifactPath}: signal result "backend-loop-scheduled-scan" evidence.scheduledScan.nextRunAtAfterSchedule must be after completedAt`,
    );
  }
}

function validateAutoSummaryEvidence(artifactPath, evidenceValue, context) {
  const { violations } = context;
  const latestFeedItemObservedAtMs = parseIsoTimestampMs(
    getPath(evidenceValue, "autoSummary.latestFeedItemObservedAt"),
  );
  const requestedAtMs = parseIsoTimestampMs(
    getPath(evidenceValue, "autoSummary.requestedAt"),
  );
  const completedAtMs = parseIsoTimestampMs(
    getPath(evidenceValue, "autoSummary.completedAt"),
  );
  if (
    latestFeedItemObservedAtMs !== undefined &&
    requestedAtMs !== undefined &&
    requestedAtMs < latestFeedItemObservedAtMs
  ) {
    violations.push(
      `${artifactPath}: signal result "backend-loop-auto-summary-scheduler" evidence.autoSummary.requestedAt must be after latestFeedItemObservedAt`,
    );
  }
  if (
    requestedAtMs !== undefined &&
    completedAtMs !== undefined &&
    completedAtMs < requestedAtMs
  ) {
    violations.push(
      `${artifactPath}: signal result "backend-loop-auto-summary-scheduler" evidence.autoSummary.completedAt must be after requestedAt`,
    );
  }
}

function validateRabbitMqAckEvidence(artifactPath, evidenceValue, context) {
  const { violations } = context;
  const before = getPath(evidenceValue, "queueDepthBeforeAck");
  const after = getPath(evidenceValue, "queueDepthAfterAck");
  if (Number.isInteger(before) && Number.isInteger(after) && after >= before) {
    violations.push(
      `${artifactPath}: signal result "rabbitmq-consumer-ack" evidence.queueDepthAfterAck must be lower than queueDepthBeforeAck`,
    );
  }
}

function validatePostgresReplayStateEvidence(artifactPath, evidenceValue, context) {
  const { violations } = context;
  if (
    evidenceValue.countsMatched === true &&
    !objectsEqual(evidenceValue.beforeCounts, evidenceValue.afterCounts)
  ) {
    violations.push(
      `${artifactPath}: signal result "postgres-outbox-inbox-idempotency" countsMatched=true requires beforeCounts and afterCounts to match`,
    );
  }
  if (
    evidenceValue.fingerprintsMatched === true &&
    !objectsEqual(
      evidenceValue.beforeFingerprints,
      evidenceValue.afterFingerprints,
    )
  ) {
    violations.push(
      `${artifactPath}: signal result "postgres-outbox-inbox-idempotency" fingerprintsMatched=true requires beforeFingerprints and afterFingerprints to match`,
    );
  }
}

function validatePostgresNoDuplicateEvidence(artifactPath, evidenceValue, context) {
  const { violations } = context;
  const before = getPath(evidenceValue, "duplicateProbeBeforeCount");
  const after = getPath(evidenceValue, "duplicateProbeAfterCount");
  if (Number.isInteger(before) && Number.isInteger(after) && before !== after) {
    violations.push(
      `${artifactPath}: signal result "postgres-no-duplicate-side-effects" duplicate probe counts must remain stable`,
    );
  }
  if (evidenceValue.duplicateInsertSuppressed === true && before !== 1) {
    violations.push(
      `${artifactPath}: signal result "postgres-no-duplicate-side-effects" duplicate probe must start from exactly one delivery attempt`,
    );
  }
  if (
    !objectsEqual(
      evidenceValue.beforeResumeCounts,
      evidenceValue.afterResumeCounts,
    )
  ) {
    violations.push(
      `${artifactPath}: signal result "postgres-no-duplicate-side-effects" beforeResumeCounts and afterResumeCounts must match`,
    );
  }
}

export function validateArtifactTimeWindow(content, artifactPath, context) {
  const { violations } = context;
  const startedAtMs = parseIsoTimestampMs(content.startedAt);
  const completedAtMs = parseIsoTimestampMs(content.completedAt);
  if (startedAtMs === undefined || completedAtMs === undefined) {
    return;
  }
  if (completedAtMs < startedAtMs) {
    violations.push(
      `${artifactPath}: completedAt must be greater than or equal to startedAt`,
    );
  }
}

function validateSignalObservedAtWindow(artifact, result, context) {
  const { violations } = context;
  const observedAtMs = parseIsoTimestampMs(result.observedAt);
  const startedAtMs = parseIsoTimestampMs(artifact.startedAt);
  const completedAtMs = parseIsoTimestampMs(artifact.completedAt);
  if (
    observedAtMs === undefined ||
    startedAtMs === undefined ||
    completedAtMs === undefined
  ) {
    return;
  }
  if (observedAtMs < startedAtMs || observedAtMs > completedAtMs) {
    violations.push(
      `${artifact.path}: signal result "${result.signalId}" observedAt must be within artifact startedAt/completedAt`,
    );
  }
}
