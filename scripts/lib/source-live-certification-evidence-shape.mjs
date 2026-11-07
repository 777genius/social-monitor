export function getPath(value, path) {
  let current = value;
  for (const segment of path.split('.')) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

export function matchesEvidenceType(value, fieldType) {
  switch (fieldType) {
    case 'non_empty_string':
      return typeof value === 'string' && value.trim().length > 0;
    case 'positive_integer':
      return Number.isInteger(value) && value > 0;
    case 'non_negative_integer':
      return Number.isInteger(value) && value >= 0;
    case 'boolean_true':
      return value === true;
    case 'non_empty_string_array':
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((item) => typeof item === 'string' && item.trim().length > 0)
      );
    case 'sha256_hex':
      return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
    default:
      return false;
  }
}

export function isSupportedEvidenceType(fieldType) {
  return new Set([
    'non_empty_string',
    'positive_integer',
    'non_negative_integer',
    'boolean_true',
    'non_empty_string_array',
    'sha256_hex',
  ]).has(fieldType);
}

export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isIsoDateString(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

