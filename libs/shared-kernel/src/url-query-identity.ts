import { isSensitiveUrlCredentialKey, sanitizeUrlCredentials } from './redaction';

const trackingNames = new Set([
  'fbclid', 'gclid', 'dclid', 'msclkid', 'igshid', 'mc_cid', 'mc_eid',
  'ref',
]);

const maxIdentityQueryParameters = 256;
const maxIdentityQueryLength = 16_384;
const credentialContextKeys = [
  'sig', 'awsaccesskeyid', 'googleaccessid', 'key-pair-id',
] as const;

const retainBenignQueryValue = (value: string, sanitized: string): string => {
  if (sanitized === value) return value;
  const schemeRelative = value.startsWith('//');
  try {
    const parsed = new URL(schemeRelative ? `https:${value}` : value);
    const canonical = schemeRelative ? parsed.href.replace(/^https:/u, '') : parsed.href;
    return sanitized === canonical ? value : sanitized;
  } catch {
    return sanitized;
  }
};

/** Preserve the order of repeated values while ignoring delivery and credential parameters. */
export const identityQueryEntries = (
  hostname: string,
  params: URLSearchParams,
): readonly (readonly [string, string])[] => {
  const host = hostname.toLowerCase().replace(/^(?:www\.|m\.|old\.|mobile\.)/u, '')
    .replace(/^twitter\.com$/u, 'x.com');
  const entries: Array<readonly [string, string, string]> = [];
  let queryLength = 0;
  for (const [name, value] of params) {
    queryLength += name.length + value.length;
    if (entries.length >= maxIdentityQueryParameters || queryLength > maxIdentityQueryLength)
      return [];
    entries.push([name, value, name.toLowerCase()]);
  }
  const normalizedNames = new Set(entries.map(([, , key]) => key));
  // The shared credential policy only uses these query companions for contextual keys.
  const context = credentialContextKeys.filter((key) => normalizedNames.has(key));
  return entries.flatMap(([name, value, key]) => {
    const safeName = publicCanonicalUrlIdentity(name);
    const safeValue = publicCanonicalUrlIdentity(value);
    if (safeName !== name || hasEncodedCredentialLayer(name) ||
        (safeValue === '' && value !== '') || hasEncodedCredentialLayer(value)) return [];
    return !key.startsWith('utm_') && !trackingNames.has(key) &&
      !isSensitiveUrlCredentialKey(key, context) &&
      !(host === 'x.com' && (key === 's' || key === 'ref_src')) &&
      !(['youtube.com', 'youtu.be'].includes(host) && key === 'si')
      ? [[name, retainBenignQueryValue(value, safeValue)] as const] : [];
  }).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
};

/** Sanitize a URL carried directly or inside a `url:` canonical identity. */
export const publicCanonicalUrlIdentity = (value: string): string => {
  const normalized = value.trim();
  if (normalized.length > maxIdentityQueryLength) return '';
  const hasPrefix = /^url:/iu.test(normalized);
  const url = hasPrefix ? normalized.slice(4).trimStart() : normalized;
  if (url.startsWith('//')) {
    const absolute = `https:${url}`;
    const safe = sanitizePublicRedirectUrl(absolute, 0);
    return safe ? `${hasPrefix ? 'url:' : ''}${safe === absolute ? url
      : safe.replace(/^https:/u, '')}` : '';
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // A malformed URL-shaped identity cannot safely be copied to a public surface.
    const compact = url.replace(/[\t\n\r]/gu, '');
    let start = 0;
    while (start < compact.length && compact.charCodeAt(start) <= 0x20) start += 1;
    return /^https?:/iu.test(compact.slice(start)) ? '' : value;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return value;
  // WHATWG accepts spellings such as `https:host`, tabs in the scheme and
  // leading C0 controls. Serialize first so credential removal sees their URL form.
  const sanitized = sanitizePublicRedirectUrl(parsed.href, 0);
  if (!sanitized) return '';
  return hasPrefix ? `url:${sanitized}` : sanitized;
};

const maxRedirectDepth = 3;
const maxDestinationLength = 4_096;

const hasEncodedCredentialLayer = (value: string): boolean => {
  let decoded = value;
  for (let layer = 0; layer < maxRedirectDepth && decoded.includes('%'); layer += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return false;
      decoded = next;
    } catch {
      return /%[0-9a-f]{2}/iu.test(decoded);
    }
    let normalized = decoded;
    try {
      normalized = new URL(decoded.startsWith('//') ? `https:${decoded}` : decoded).href;
    } catch { /* It may be a decoded URL component. */ }
    if (sanitizeUrlCredentials(normalized) !== normalized) return true;
  }
  // An encoded value that cannot be inspected within the bound is ambiguous.
  return /%[0-9a-f]{2}/iu.test(decoded);
};

/** Known redirect keys also reject non-HTTP destinations. URL values in any key are inspected. */
const redirectDestinationKeys = (url: URL): ReadonlySet<string> => {
  const host = url.hostname.toLowerCase().replace(/\.+$/u, '').replace(/^www\./u, '');
  let path: string;
  try { path = decodeURIComponent(url.pathname).toLowerCase(); } catch { return new Set(); }
  path = path.replace(/\/+$/u, '') || '/';
  if ((host === 'google.com' || host === 'google.co.uk') && path === '/url')
    return new Set(['url', 'q']);
  if ((host === 'facebook.com' || host === 'l.facebook.com') && path === '/l.php')
    return new Set(['u']);
  if (host === 'linkedin.com' && path === '/redir/redirect')
    return new Set(['url']);
  if (host === 'duckduckgo.com' && path === '/l')
    return new Set(['uddg']);
  return new Set();
};

const sanitizePublicRedirectUrl = (value: string, depth: number): string => {
  let parsed: URL;
  try {
    parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
  } catch {
    return '';
  }
  const sanitized = sanitizeUrlCredentials(parsed.href);
  const fragmentStart = sanitized.indexOf('#');
  const fragment = fragmentStart < 0 ? '' : sanitized.slice(fragmentStart + 1);
  const outer = fragment && (sanitizeUrlCredentials(fragment) !== fragment ||
    hasEncodedCredentialLayer(fragment) || (fragment.startsWith('//') &&
      publicCanonicalUrlIdentity(fragment) !== fragment)) ? sanitized.slice(0, fragmentStart) : sanitized;
  try { parsed = new URL(outer); } catch { return ''; }
  const destinationKeys = redirectDestinationKeys(parsed);
  if (!parsed.search) return outer;
  const queryStart = outer.indexOf('?');
  const queryEnd = outer.indexOf('#', queryStart);
  const rawQuery = outer.slice(queryStart + 1, queryEnd < 0 ? undefined : queryEnd);
  const retained = rawQuery.split('&').flatMap((component) => {
    const [name] = [...new URLSearchParams(component).keys()];
    const queryName = name ?? '';
    if (sanitizeUrlCredentials(queryName) !== queryName ||
        (queryName.startsWith('//') && publicCanonicalUrlIdentity(queryName) !== queryName) ||
        hasEncodedCredentialLayer(queryName)) return [];
    const destination = new URLSearchParams(component).get(queryName)?.trim() ?? '';
    const knownDestination = destinationKeys.has(queryName.toLowerCase());
    const schemeRelative = destination.startsWith('//');
    let nested: URL | undefined;
    try { nested = schemeRelative ? new URL(destination, parsed) : new URL(destination); }
    catch { /* It may be ordinary query text. */ }
    const isHttpUrl = nested?.protocol === 'http:' || nested?.protocol === 'https:';
    const looksHttpUrl = /^https?:/iu.test(destination.replace(/[\t\n\r]/gu, '').trimStart());
    if (!knownDestination && !isHttpUrl && !looksHttpUrl &&
        sanitizeUrlCredentials(destination) === destination &&
        !hasEncodedCredentialLayer(destination)) return [component];
    // Invalid, oversized, or excessively nested destinations are discarded.
    if (depth >= maxRedirectDepth || destination.length > maxDestinationLength ||
        hasEncodedCredentialLayer(destination) || !nested || !isHttpUrl) return [];
    const safe = sanitizePublicRedirectUrl(nested.href, depth + 1);
    if (!safe) return [];
    const safeDestination = schemeRelative ? safe.replace(/^https?:/u, '') : safe;
    return safe === nested.href && (schemeRelative || /^https?:\/\//iu.test(destination))
      ? [component]
      : [`${component.slice(0, component.indexOf('='))}=${encodeURIComponent(
        safeDestination)}`];
  });
  const suffix = queryEnd < 0 ? '' : outer.slice(queryEnd);
  return `${outer.slice(0, queryStart)}${retained.length ? `?${retained.join('&')}` : ''}${suffix}`;
};
