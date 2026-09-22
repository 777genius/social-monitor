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
const credentialShapedRouteKeyPattern = /(?:^|[_-])(?:token|secret|credential|authorization|signature|api[_-]?key|private[_-]?key|session[_-]?id)(?:$|[_-])/i;
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
  if (isSensitiveKey(normalized)) return true;
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
    const queryKeys = [...url.searchParams.keys()];
    const normalizedQueryKeys = new Set(queryKeys.map((key) => key.toLowerCase()));
    const fragment = analyzeUrlFragment(url.hash.slice(1));
    return url.username.length > 0 || url.password.length > 0 ||
      queryKeys.some((key) => isSensitiveNormalizedUrlCredentialKey(
        key.toLowerCase(), normalizedQueryKeys,
      )) || fragment.hasCredentials;
  } catch {
    return false;
  }
};

/** Parse first so one credential value can never consume a following URL parameter. */
export const sanitizeUrlCredentials = (value: string): string => {
  try {
    const normalizedValue = normalizeWhatwgUrlInput(value);
    const url = new URL(normalizedValue);
    const queryKeys = [...url.searchParams.keys()];
    const normalizedQueryKeys = new Set(queryKeys.map((key) => key.toLowerCase()));
    const fragmentStart = normalizedValue.indexOf('#');
    const rawFragment = fragmentStart >= 0 ? normalizedValue.slice(fragmentStart + 1) : '';
    const queryStart = normalizedValue.indexOf('?');
    const hasQuery = queryStart >= 0 && (fragmentStart < 0 || queryStart < fragmentStart);
    const queryEnd = fragmentStart < 0 ? normalizedValue.length : fragmentStart;
    const retained = hasQuery
      ? retainSafeUrlParameterComponents(
        normalizedValue.slice(queryStart + 1, queryEnd), normalizedQueryKeys,
      )
      : [];
    const withoutSensitiveQuery = hasQuery
      ? `${normalizedValue.slice(0, queryStart)}${retained.length > 0 ? `?${retained.join('&')}` : ''}${normalizedValue.slice(queryEnd)}`
      : normalizedValue;
    const sanitizedFragment = fragmentStart >= 0
      ? sanitizeUrlFragment(rawFragment)
      : rawFragment;
    const hasSanitizedFragment = rawFragment.length === 0 || sanitizedFragment.length > 0;
    const withoutSensitiveFragment = fragmentStart >= 0
      ? `${withoutSensitiveQuery.slice(0, withoutSensitiveQuery.indexOf('#'))}${hasSanitizedFragment ? `#${sanitizedFragment}` : ''}`
      : withoutSensitiveQuery;
    return url.username.length > 0 || url.password.length > 0
      ? removeRawUrlUserInfo(withoutSensitiveFragment)
      : withoutSensitiveFragment;
  } catch {
    return redactSensitiveTextFallback(value);
  }
};

// The URL parser removes ASCII tabs/newlines anywhere and trims leading or
// trailing C0 controls and spaces before parsing. Apply that preprocessing to
// the raw representation too so credential detection and removal see the same
// bytes while retained components otherwise remain unchanged.
const normalizeWhatwgUrlInput = (value: string): string => {
  const withoutAsciiTabOrNewline = value.replace(/[\t\n\r]/g, '');
  let start = 0;
  let end = withoutAsciiTabOrNewline.length;
  while (start < end && withoutAsciiTabOrNewline.charCodeAt(start) <= 0x20) start += 1;
  while (end > start && withoutAsciiTabOrNewline.charCodeAt(end - 1) <= 0x20) end -= 1;
  return withoutAsciiTabOrNewline.slice(start, end);
};

type FragmentComponent = { raw: string; key: string };

const fragmentComponents = (raw: string): FragmentComponent[] => raw.split('&').map((part) => ({
  raw: part,
  key: new URLSearchParams(part).keys().next().value ?? '',
}));

const encodedBracketAt = (raw: string, index: number): '[' | ']' | '' => {
  const encoded = raw.slice(index, index + 3).toLowerCase();
  return encoded === '%5b' ? '[' : encoded === '%5d' ? ']' : '';
};

// An unclosed bracket is route text, not a reason to hide a later query or
// matrix delimiter. Match encoded and literal brackets within each key first.
const matchedBracketOpenings = (raw: string): ReadonlySet<number> => {
  const openings = new Set<number>();
  const pending: number[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const encoded = encodedBracketAt(raw, index);
    const bracket = encoded || raw.charAt(index);
    if (bracket === '[') pending.push(index);
    else if (bracket === ']' && pending.length > 0) {
      openings.add(pending.pop()!);
    } else if (bracket === '=' || bracket === '&') pending.length = 0;
    if (encoded) index += 2;
  }
  return openings;
};

// Brackets in a parameter name can contain a literal question mark. Route
// paths and values still expose query suffixes after a question mark.
const fragmentDelimiterStart = (raw: string, delimiters: string): number => {
  const matchedOpenings = matchedBracketOpenings(raw);
  let bracketDepth = 0;
  let inValue = false;
  let inRouteBase = raw.startsWith('/') || raw.startsWith('!');
  for (let index = 0; index < raw.length; index += 1) {
    const encodedBracket = !inValue && !inRouteBase ? encodedBracketAt(raw, index) : '';
    if (encodedBracket) {
      if (encodedBracket === '[' && matchedOpenings.has(index)) bracketDepth += 1;
      else if (encodedBracket === ']') bracketDepth = Math.max(0, bracketDepth - 1);
      index += 2;
      continue;
    }
    if (raw[index] === '&') {
      bracketDepth = 0;
      inValue = false;
      inRouteBase = false;
    } else if (raw[index] === '=') {
      bracketDepth = 0;
      inValue = true;
      inRouteBase = false;
    } else if (bracketDepth === 0 && delimiters.includes(raw.charAt(index))) return index;
    else if (raw[index] === ';' && bracketDepth === 0) {
      inValue = false;
      inRouteBase = false;
    } else if (!inValue && !inRouteBase && raw[index] === '[' && matchedOpenings.has(index)) bracketDepth += 1;
    else if (!inValue && !inRouteBase && raw[index] === ']') bracketDepth = Math.max(0, bracketDepth - 1);
  }
  return -1;
};

const fragmentQueryStart = (raw: string): number => fragmentDelimiterStart(raw, '?');

// Matrix separators are lexical: a semicolon inside a bracketed key belongs
// to that key, while a semicolon after '=' starts the next matrix field.
const matrixFields = (raw: string): FragmentComponent[] => {
  const fields: FragmentComponent[] = [];
  const matchedOpenings = matchedBracketOpenings(raw);
  let start = 0;
  let bracketDepth = 0;
  let inValue = false;
  for (let index = 0; index <= raw.length; index += 1) {
    const character = raw.charAt(index);
    const encodedBracket = !inValue ? encodedBracketAt(raw, index) : '';
    if (encodedBracket) {
      if (encodedBracket === '[' && matchedOpenings.has(index)) bracketDepth += 1;
      else if (encodedBracket === ']') bracketDepth = Math.max(0, bracketDepth - 1);
      index += 2;
      continue;
    }
    if (index === raw.length || (character === ';' && bracketDepth === 0)) {
      const part = raw.slice(start, index);
      fields.push({ raw: part, key: new URLSearchParams(part).keys().next().value ?? '' });
      start = index + 1;
      bracketDepth = 0;
      inValue = false;
    } else if (character === '=') {
      bracketDepth = 0;
      inValue = true;
    } else if (!inValue && character === '[' && matchedOpenings.has(index)) bracketDepth += 1;
    else if (!inValue && character === ']') bracketDepth = Math.max(0, bracketDepth - 1);
  }
  return fields;
};

// Classify the full list, route suffix, and leading matrix fields against the
// same original key set. Removing a companion must not change later decisions.
const analyzeUrlFragment = (raw: string): { hasCredentials: boolean; sanitized: string } => {
  const full = fragmentComponents(raw);
  const queryStart = fragmentQueryStart(raw);
  const queryComponentIndex = queryStart < 0 ? -1 : raw.slice(0, queryStart).split('&').length - 1;
  const suffix = queryStart < 0 ? [] : fragmentComponents(raw.slice(queryStart + 1));
  const first = full[0]?.raw ?? '';
  const routeEnd = fragmentDelimiterStart(first, ';?');
  const routePrefix = routeEnd < 0 ? first : first.slice(0, routeEnd);
  const decodedRoutePrefix = new URLSearchParams(`${routePrefix}=`).keys().next().value ?? '';
  const normalizedRoutePrefix = decodedRoutePrefix.toLowerCase();
  const credentialRoutePrefix = !decodedRoutePrefix.includes('/') &&
    (commonUrlCredentialKeys.has(normalizedRoutePrefix) ||
      credentialShapedRouteKeyPattern.test(normalizedRoutePrefix));
  const leadingRoute = first.startsWith('/') || first.startsWith('!') ||
    (routeEnd >= 0 && !routePrefix.includes('=') &&
      first[routeEnd + 1] !== '=' && !credentialRoutePrefix);
  const matrixEnd = queryComponentIndex === 0 ? queryStart : -1;
  const matrixText = leadingRoute
    ? first.slice(0, matrixEnd < 0 ? first.length : matrixEnd)
    : '';
  // A raw slash ends a route segment's matrix fields. Keep later segments
  // intact, and inspect their own fields for credentials as well.
  const matrixSegments = leadingRoute ? matrixText.split('/').map((segment) => {
    const start = fragmentDelimiterStart(segment, ';');
    return start < 0
      ? { base: segment, fields: [] as FragmentComponent[] }
      : { base: segment.slice(0, start), fields: matrixFields(segment.slice(start + 1)) };
  }) : [];
  const matrix = matrixSegments.flatMap(({ fields }) => fields);
  const normalizedKeys = new Set([...full, ...suffix, ...matrix]
    .map(({ key }) => key.toLowerCase()));
  const sensitive = (key: string): boolean =>
    isSensitiveNormalizedUrlCredentialKey(key.toLowerCase(), normalizedKeys);
  const removeFull = new Set(full.flatMap(({ key }, index) =>
    !(leadingRoute && index === 0) && sensitive(key) ? [index] : []));
  const removeSuffix = new Set(suffix.flatMap(({ key }, index) =>
    sensitive(key) ? [index] : []));
  const removeMatrix = new Set(matrix.filter(({ key }) => sensitive(key)));
  // A '?' directly in a sensitive matrix name can make its value look like a
  // harmless query field. Drop that ambiguous first suffix with the field.
  const finalMatrixField = matrixSegments[matrixSegments.length - 1]?.fields.at(-1);
  if (queryComponentIndex === 0 && finalMatrixField &&
    !finalMatrixField.raw.includes('=') && sensitive(finalMatrixField.key)) {
    removeSuffix.add(0);
  }
  const hasCredentials = removeFull.size > 0 || removeSuffix.size > 0 || removeMatrix.size > 0;
  if (!hasCredentials) return { hasCredentials: false, sanitized: raw };

  const retained = full.flatMap(({ raw: component }, index) => {
    if (removeFull.has(index) || (index > queryComponentIndex &&
      removeSuffix.has(index - queryComponentIndex))) return [];
    let safe = component;
    if (index === 0 && removeMatrix.size > 0) {
      safe = matrixSegments.map(({ base, fields }) => [base, ...fields.filter((field) =>
        !removeMatrix.has(field)).map(({ raw }) => raw)].join(';')).join('/') +
        component.slice(matrixText.length);
    }
    if (index === queryComponentIndex && removeSuffix.has(0)) {
      safe = safe.slice(0, fragmentQueryStart(safe));
    }
    return [{ raw: safe, index }];
  });
  const retainedQueryPrefix = retained.some(({ index }) => index === queryComponentIndex);
  let querySeparatorPending = retainedQueryPrefix && removeSuffix.has(0);
  const sanitized = retained.reduce((result, component, position) => {
    if (position === 0) return component.raw;
    if (querySeparatorPending && component.index > queryComponentIndex) {
      querySeparatorPending = false;
      return `${result}?${component.raw}`;
    }
    return `${result}&${component.raw}`;
  }, '');
  return { hasCredentials, sanitized };
};

const sanitizeUrlFragment = (rawFragment: string): string =>
  analyzeUrlFragment(rawFragment).sanitized;

const retainSafeUrlParameterComponents = (
  rawParameters: string,
  normalizedKeys: ReadonlySet<string>,
): string[] => rawParameters.split('&').filter((component) => {
  const key = new URLSearchParams(component).keys().next().value ?? '';
  return !isSensitiveNormalizedUrlCredentialKey(key.toLowerCase(), normalizedKeys);
});

const removeRawUrlUserInfo = (value: string): string => {
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(value);
  if (!scheme) return value;
  const authorityStart = scheme[0].length;
  const authorityLength = value.slice(authorityStart).search(/[/?#]/);
  const end = authorityLength < 0 ? value.length : authorityStart + authorityLength;
  const userInfoEnd = value.lastIndexOf('@', end);
  return userInfoEnd < authorityStart
    ? value
    : `${value.slice(0, authorityStart)}${value.slice(userInfoEnd + 1)}`;
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
  !/[?#]/.test(value) ? value : value.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"<>{}]+/gi, (candidate) => {
    if (!/[?#]/.test(candidate) || !urlContainsCredentials(candidate)) return candidate;
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
