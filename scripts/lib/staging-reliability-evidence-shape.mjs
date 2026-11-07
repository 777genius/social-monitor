// Staging reliability evidence shape policy. Pure functions; no IO or runtime configuration.

/** Check whether a signal contains non-empty evidence using existing shape rules. */
export function hasNonEmptyEvidence(evidenceValue) {
  if (typeof evidenceValue === "string") {
    return evidenceValue.trim().length > 0;
  }
  if (Array.isArray(evidenceValue)) {
    return evidenceValue.length > 0;
  }
  if (isRecord(evidenceValue)) {
    return Object.keys(evidenceValue).length > 0;
  }

  return false;
}

/** Read nested evidence paths, preserving inherited-property lookup semantics. */
export function getPath(value, path) {
  let current = value;
  for (const segment of path.split(".")) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

/** Check a signal evidence field against its declared staging-specific type. */
export function matchesEvidenceType(value, fieldType) {
  switch (fieldType) {
    case "non_empty_string":
      return typeof value === "string" && value.trim().length > 0;
    case "iso_timestamp":
      return isIsoTimestamp(value);
    case "boolean_true":
      return value === true;
    case "boolean_false":
      return value === false;
    case "at_least_three_integer":
      return Number.isInteger(value) && value >= 3;
    case "positive_integer":
      return Number.isInteger(value) && value > 0;
    case "non_negative_integer":
      return Number.isInteger(value) && value >= 0;
    case "non_empty_string_array":
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every(
          (item) => typeof item === "string" && item.trim().length > 0,
        )
      );
    case "non_empty_object":
      return isRecord(value) && Object.keys(value).length > 0;
    case "non_empty_object_array":
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((item) => isRecord(item) && Object.keys(item).length > 0)
      );
    case "durable_provider_key":
      return [
        "github-issues",
        "github-trending-page",
        "hacker-news",
        "hn",
        "reddit",
        "rss",
      ].includes(value);
    case "scheduled_idempotency_key":
      return (
        typeof value === "string" &&
        value.startsWith("scheduled:") &&
        value.trim().length > "scheduled:".length
      );
    case "auto_summary_idempotency_key":
      return (
        typeof value === "string" &&
        value.startsWith("auto-summary:") &&
        value.trim().length > "auto-summary:".length
      );
    case "scan_status_succeeded":
      return value === "SUCCEEDED";
    case "terminal_summary_status":
      return value === "completed" || value === "no_signal";
    default:
      return false;
  }
}

/** Recognize strict ISO-shaped timestamps accepted by the staging checker. */
export function isIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    parseIsoTimestampMs(value) !== undefined
  );
}

/** Parse a timestamp into milliseconds when Date.parse accepts it. */
export function parseIsoTimestampMs(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** Report whether a staging signal schema field type is supported. */
export function isSupportedEvidenceType(fieldType) {
  return new Set([
    "non_empty_string",
    "iso_timestamp",
    "boolean_true",
    "boolean_false",
    "at_least_three_integer",
    "positive_integer",
    "non_negative_integer",
    "non_empty_string_array",
    "non_empty_object",
    "non_empty_object_array",
    "durable_provider_key",
    "scheduled_idempotency_key",
    "auto_summary_idempotency_key",
    "scan_status_succeeded",
    "terminal_summary_status",
  ]).has(fieldType);
}

/** Check for a non-null, non-array object. */
export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Compare record structures independent of object-key insertion order. */
export function objectsEqual(left, right) {
  if (!isRecord(left) || !isRecord(right)) {
    return false;
  }

  return JSON.stringify(sortObject(left)) === JSON.stringify(sortObject(right));
}

/** Recursively sort record keys without changing array order. */
export function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObject(value[key])]),
  );
}

