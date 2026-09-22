export const REDACTED_VALUE = '[REDACTED]';

export type RedactableMetadataValue = string | number | boolean | readonly string[] | undefined;

const sensitiveKeyPattern = /(?:secret|token|password|credential|authorization|api[_-]?key|refresh[_-]?token|access[_-]?token|private[_-]?key|cookie|session|signature)/i;
const bearerPattern = /^bearer\s+(?!jwt\b)[A-Za-z0-9._~+/-]{8,}=*/i;
const basicPattern = /^basic\s+(?!client\b)[A-Za-z0-9._~+/-]{8,}=*/i;
const generatedSecretPattern = /^(?:smk|whsec)_[A-Za-z0-9_-]+/;
const urlWithPasswordPattern = /^[a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:[^@\s]+@/i;
const inlineCredentialPattern =
  /\b((?:access|refresh|id)?[_-]?token|api[_-]?key|client[_-]?secret|secret|credential|authorization|password|session|cookie|signature|private[_-]?key)\s*[:=]\s*([^\s'",<>{}&?#]+)/gi;
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

const commonUrlCredentialKeys = new Set([
  'access-token', 'access_token', 'accesstoken', 'api-key', 'api_key', 'apikey',
  'auth', 'authorization', 'auth-token', 'auth_token', 'authtoken', 'client-secret',
  'client_secret', 'credential', 'id-token', 'id_token', 'idtoken', 'jwt',
  'oauth-token', 'oauth_token', 'password', 'refresh-token', 'refresh_token',
  'refreshtoken', 'secret', 'session', 'signature', 'token',
]);
const azureSignedUrlKeys = new Set([
  'rscc', 'rscd', 'rsce', 'rscl', 'rsct', 'scid', 'se', 'ses', 'si', 'sig', 'sip',
  'skoid', 'sks', 'skt', 'sktid', 'skv', 'sp', 'spr', 'sr', 'srt', 'ss', 'st', 'sv',
]);
const awsV4SignedUrlKeys = new Set([
  'x-amz-algorithm', 'x-amz-content-sha256', 'x-amz-credential', 'x-amz-date',
  'x-amz-expires', 'x-amz-security-token', 'x-amz-signature', 'x-amz-signedheaders',
]);
const googleV4SignedUrlKeys = new Set([
  'x-goog-algorithm', 'x-goog-content-sha256', 'x-goog-credential', 'x-goog-date',
  'x-goog-expires', 'x-goog-signature', 'x-goog-signedheaders',
]);

/**
 * URL query credentials need more context than record keys. In particular,
 * short Azure names such as `se` and `sv` are only credentials when the query
 * also carries an Azure signature, while provider-prefixed AWS/Google keys are
 * unambiguous on their own.
 */
export const isSensitiveUrlCredentialKey = (
  key: string,
  queryKeys: readonly string[] = [key],
): boolean => isSensitiveNormalizedUrlCredentialKey(
  key.toLowerCase(),
  new Set(queryKeys.map((entry) => entry.toLowerCase())),
);

const isSensitiveNormalizedUrlCredentialKey = (
  normalized: string,
  normalizedKeys: ReadonlySet<string>,
): boolean => {
  if (commonUrlCredentialKeys.has(normalized)) return true;
  if (awsV4SignedUrlKeys.has(normalized) || googleV4SignedUrlKeys.has(normalized)) return true;
  if (['awsaccesskeyid', 'googleaccessid', 'key-pair-id'].includes(normalized)) return true;
  if (normalized === 'expires' && ['awsaccesskeyid', 'googleaccessid', 'key-pair-id']
    .some((companion) => normalizedKeys.has(companion))) return true;
  if (normalized === 'policy' && normalizedKeys.has('key-pair-id')) return true;
  return azureSignedUrlKeys.has(normalized) && normalizedKeys.has('sig');
};

export const urlContainsCredentials = (value: string): boolean => {
  try {
    const url = new URL(value);
    const keys = [...url.searchParams.keys()];
    const normalizedKeys = new Set(keys.map((key) => key.toLowerCase()));
    return url.username.length > 0 || url.password.length > 0 ||
      keys.some((key) => isSensitiveNormalizedUrlCredentialKey(key.toLowerCase(), normalizedKeys));
  } catch {
    return false;
  }
};

/** Parse first so one credential value can never consume a following query parameter. */
export const sanitizeUrlCredentials = (value: string): string => {
  try {
    const url = new URL(value);
    const keys = [...url.searchParams.keys()];
    const normalizedKeys = new Set(keys.map((key) => key.toLowerCase()));
    url.username = '';
    url.password = '';
    url.hash = '';
    const retained = [...url.searchParams.entries()].filter(
      ([key]) => !isSensitiveNormalizedUrlCredentialKey(key.toLowerCase(), normalizedKeys),
    );
    url.search = '';
    for (const [key, entry] of retained) url.searchParams.append(key, entry);
    return url.toString();
  } catch {
    return redactSensitiveTextFallback(value);
  }
};

export const isSensitiveString = (value: string): boolean =>
  bearerPattern.test(value) ||
  basicPattern.test(value) ||
  generatedSecretPattern.test(value) ||
  urlWithPasswordPattern.test(value);

export const redactSensitiveText = (value: string): string =>
  redactUrlPasswords(redactEmbeddedUrlCredentials(value)
    .replace(inlineJsonCredentialPattern, (_match, key: string) => `"${key}":"${REDACTED_VALUE}"`)
    .replace(inlineBearerPattern, REDACTED_VALUE)
    .replace(inlineCredentialPattern, (_match, key: string) => `${key}=${REDACTED_VALUE}`)
    .replace(inlineGeneratedSecretPattern, REDACTED_VALUE));

const redactSensitiveTextFallback = (value: string): string =>
  redactUrlPasswords(value
    .replace(inlineJsonCredentialPattern, (_match, key: string) => `"${key}":"${REDACTED_VALUE}"`)
    .replace(inlineBearerPattern, REDACTED_VALUE)
    .replace(inlineCredentialPattern, (_match, key: string) => `${key}=${REDACTED_VALUE}`)
    .replace(inlineGeneratedSecretPattern, REDACTED_VALUE));

const redactEmbeddedUrlCredentials = (value: string): string =>
  !value.includes('?') ? value : value.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"<>{}]+/gi, (candidate) => {
    if (!candidate.includes('?') || !urlContainsCredentials(candidate)) return candidate;
    return sanitizeUrlCredentials(candidate);
  });

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
