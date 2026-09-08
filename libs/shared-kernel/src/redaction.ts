export const REDACTED_VALUE = '[REDACTED]';

export type RedactableMetadataValue = string | number | boolean | readonly string[] | undefined;

const sensitiveKeyPattern = /(?:secret|token|password|credential|authorization|api[_-]?key|refresh[_-]?token|access[_-]?token|private[_-]?key|cookie|session|signature)/i;
const bearerPattern = /^bearer\s+(?!jwt\b)[A-Za-z0-9._~+/-]{8,}=*/i;
const basicPattern = /^basic\s+(?!client\b)[A-Za-z0-9._~+/-]{8,}=*/i;
const generatedSecretPattern = /^(?:smk|whsec)_[A-Za-z0-9_-]+/;
const urlWithPasswordPattern = /^[a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:[^@\s]+@/i;
const inlineCredentialPattern =
  /\b((?:access|refresh|id)?[_-]?token|api[_-]?key|client[_-]?secret|secret|credential|authorization|password|session|cookie|signature|private[_-]?key)\s*[:=]\s*([^\s'",<>{}]+)/gi;
const inlineJsonCredentialPattern =
  /"((?:access|refresh|id)?[_-]?token|api[_-]?key|client[_-]?secret|secret|credential|authorization|password|session|cookie|signature|private[_-]?key)"\s*:\s*"[^"]+"/gi;
const inlineBearerPattern = /\b(?:bearer|basic)\s+(?!jwt\b|client\b)[A-Za-z0-9._~+/-]{8,}=*/gi;
const inlineGeneratedSecretPattern = /\b(?:smk|whsec)_[A-Za-z0-9_-]+\b/g;
const sensitiveTextFragmentPatterns = [
  inlineJsonCredentialPattern,
  inlineCredentialPattern,
  inlineBearerPattern,
  inlineGeneratedSecretPattern,
] as const;

export const isSensitiveKey = (key: string): boolean => sensitiveKeyPattern.test(key);

export const isSensitiveString = (value: string): boolean =>
  bearerPattern.test(value) ||
  basicPattern.test(value) ||
  generatedSecretPattern.test(value) ||
  urlWithPasswordPattern.test(value);

export const redactSensitiveText = (value: string): string =>
  redactUrlPasswords(value
    .replace(inlineJsonCredentialPattern, (_match, key: string) => `"${key}":"${REDACTED_VALUE}"`)
    .replace(inlineBearerPattern, REDACTED_VALUE)
    .replace(inlineCredentialPattern, (_match, key: string) => `${key}=${REDACTED_VALUE}`)
    .replace(inlineGeneratedSecretPattern, REDACTED_VALUE));

export const countSensitiveTextFragments = (value: string): number =>
  sensitiveTextFragmentPatterns.reduce(
    (count, pattern) => count + [...value.matchAll(pattern)].length,
    0,
  ) + scanUrlPasswords(value, () => undefined);

export const redactSensitiveResponseText = (value: string, maxLength = 500): string =>
  redactSensitiveText(value
    .replace(/"access_token"\s*:\s*"[^"]+"/gi, `"access_token":"${REDACTED_VALUE}"`)
    .replace(/"refresh_token"\s*:\s*"[^"]+"/gi, `"refresh_token":"${REDACTED_VALUE}"`)
    .replace(/"client_secret"\s*:\s*"[^"]+"/gi, `"client_secret":"${REDACTED_VALUE}"`))
    .slice(0, maxLength);

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
    return redactSensitiveStringValue(value);
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
    return redactSensitiveStringValue(value);
  }

  if (Array.isArray(value)) {
    return value.map(redactSensitiveStringValue);
  }

  return value;
};

const redactSensitiveStringValue = (value: string): string =>
  isSensitiveString(value) ? REDACTED_VALUE : redactSensitiveText(value);

// Match the legacy ASCII scheme/word-boundary grammar without restarting at
// every letter after a hyphen. All cursors advance; password lookahead is shared
// across failed candidates, including nested URLs without a terminating @.
const scanUrlPasswords = (
  value: string,
  onMatch: (credentialsStart: number, end: number) => void,
): number => {
  let schemeStart = -1;
  let passwordEnd = 0;
  let count = 0;
  for (let cursor = 0; cursor < value.length; cursor += 1) {
    const character = value.charAt(cursor);
    if (/[a-z0-9+.-]/i.test(character)) {
      if (schemeStart < 0 && /[a-z]/i.test(character)
        && (cursor === 0 || !/[a-z0-9_]/i.test(value.charAt(cursor - 1)))) {
        schemeStart = cursor;
      }
      continue;
    }
    const hasScheme = schemeStart >= 0;
    schemeStart = -1;
    if (!hasScheme || character !== ':' || value.charAt(cursor + 1) !== '/'
      || value.charAt(cursor + 2) !== '/') {
      continue;
    }
    const credentialsStart = cursor + 3;
    let separator = credentialsStart;
    while (separator < value.length && !/[:\s/@]/.test(value.charAt(separator))) {
      separator += 1;
    }
    if (separator === credentialsStart || value.charAt(separator) !== ':') {
      continue;
    }
    const passwordStart = separator + 1;
    passwordEnd = Math.max(passwordEnd, passwordStart);
    while (passwordEnd < value.length && !/[@\s]/.test(value.charAt(passwordEnd))) {
      passwordEnd += 1;
    }
    if (passwordEnd === passwordStart || value.charAt(passwordEnd) !== '@') {
      continue;
    }
    onMatch(credentialsStart, passwordEnd + 1);
    count += 1;
    cursor = passwordEnd;
  }
  return count;
};

const redactUrlPasswords = (value: string): string => {
  const parts: string[] = [];
  let copiedThrough = 0;
  scanUrlPasswords(value, (credentialsStart, end) => {
    parts.push(value.slice(copiedThrough, credentialsStart), `${REDACTED_VALUE}@`);
    copiedThrough = end;
  });
  parts.push(value.slice(copiedThrough));
  return parts.join('');
};
