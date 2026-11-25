export function sampleSignalFingerprint(sample) {
  if (sample === null || typeof sample !== 'object' || Array.isArray(sample)) {
    return undefined;
  }
  if (
    typeof sample.category !== 'string' ||
    typeof sample.sanitizedSignal !== 'string' ||
    typeof sample.redactedComment !== 'string'
  ) {
    return undefined;
  }

  return JSON.stringify([
    sample.category.trim(),
    sample.sanitizedSignal.trim(),
    sample.redactedComment.trim(),
  ]);
}

export function isIsoDateString(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

export function parseIsoTimestampMs(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}
