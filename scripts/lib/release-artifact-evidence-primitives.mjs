import { URL } from 'node:url';

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
    case 'success_http_status':
      return Number.isInteger(value) && value >= 200 && value < 300;
    case 'boolean_true':
      return value === true;
    case 'boolean_false':
      return value === false;
    case 'sha256_hex':
      return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
    case 'non_empty_string_array':
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((item) => typeof item === 'string' && item.trim().length > 0)
      );
    default:
      return false;
  }
}

export function isSupportedEvidenceType(fieldType) {
  return new Set([
    'non_empty_string',
    'success_http_status',
    'boolean_true',
    'boolean_false',
    'sha256_hex',
    'non_empty_string_array',
  ]).has(fieldType);
}

export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isHttpUrlWithoutCredentials(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

export function isIsoDateString(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}
