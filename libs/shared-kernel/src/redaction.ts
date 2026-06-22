export const REDACTED_VALUE = '[REDACTED]';

export type RedactableMetadataValue = string | number | boolean | readonly string[] | undefined;

const sensitiveKeyPattern = /(?:secret|token|password|credential|authorization|api[_-]?key|refresh[_-]?token|access[_-]?token|private[_-]?key|cookie|session|signature)/i;
const bearerPattern = /^bearer\s+\S+/i;
const basicPattern = /^basic\s+\S+/i;
const generatedSecretPattern = /^(?:smk|whsec)_[A-Za-z0-9_-]+/;
const urlWithPasswordPattern = /^[a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:[^@\s]+@/i;
const inlineCredentialPattern =
  /\b((?:access|refresh|id)[_-]?token|api[_-]?key|client[_-]?secret|authorization|password|session|cookie|signature)\s*[:=]\s*([^\s'",<>{}]+)/gi;
const inlineBearerPattern = /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/-]+=*/gi;
const inlineGeneratedSecretPattern = /\b(?:smk|whsec)_[A-Za-z0-9_-]+\b/g;

export const isSensitiveKey = (key: string): boolean => sensitiveKeyPattern.test(key);

export const isSensitiveString = (value: string): boolean =>
  bearerPattern.test(value) ||
  basicPattern.test(value) ||
  generatedSecretPattern.test(value) ||
  urlWithPasswordPattern.test(value);

export const redactSensitiveText = (value: string): string =>
  value
    .replace(inlineCredentialPattern, (_match, key: string) => `${key}=${REDACTED_VALUE}`)
    .replace(inlineBearerPattern, REDACTED_VALUE)
    .replace(inlineGeneratedSecretPattern, REDACTED_VALUE);

export const redactSensitiveRecord = (
  record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, redactSensitiveValue(key, value)]),
  );

export const redactSensitiveValue = (key: string, value: unknown): unknown => {
  if (isSensitiveKey(key)) {
    return REDACTED_VALUE;
  }

  if (typeof value === 'string') {
    return isSensitiveString(value) ? REDACTED_VALUE : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValue('', item));
  }

  if (typeof value === 'object' && value !== null) {
    return redactSensitiveRecord(value as Readonly<Record<string, unknown>>);
  }

  return value;
};

export const redactSensitiveMetadataRecord = (
  metadata: Readonly<Record<string, RedactableMetadataValue>>,
): Readonly<Record<string, RedactableMetadataValue>> => {
  const redacted: Record<string, RedactableMetadataValue> = {};

  for (const [key, value] of Object.entries(metadata)) {
    redacted[key] = redactSensitiveMetadataValue(key, value);
  }

  return redacted;
};

const redactSensitiveMetadataValue = (
  key: string,
  value: RedactableMetadataValue,
): RedactableMetadataValue => {
  if (value === undefined) {
    return undefined;
  }

  if (isSensitiveKey(key)) {
    return REDACTED_VALUE;
  }

  if (typeof value === 'string') {
    return isSensitiveString(value) ? REDACTED_VALUE : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => isSensitiveString(item) ? REDACTED_VALUE : item);
  }

  return value;
};
