import { isSensitiveUrlCredentialKey, sanitizeUrlCredentials } from './redaction';

const trackingNames = new Set([
  'fbclid', 'gclid', 'dclid', 'msclkid', 'igshid', 'mc_cid', 'mc_eid',
  'ref',
]);

/** Preserve the order of repeated values while ignoring delivery and credential parameters. */
export const identityQueryEntries = (
  hostname: string,
  params: URLSearchParams,
): readonly (readonly [string, string])[] => {
  const host = hostname.toLowerCase().replace(/^(?:www\.|m\.|old\.|mobile\.)/u, '')
    .replace(/^twitter\.com$/u, 'x.com');
  const entries = [...params.entries()];
  const names = entries.map(([name]) => name);
  return entries.filter(([name]) => {
    const key = name.toLowerCase();
    return !key.startsWith('utm_') && !trackingNames.has(key) &&
      !isSensitiveUrlCredentialKey(name, names) &&
      !(host === 'x.com' && (key === 's' || key === 'ref_src')) &&
      !(['youtube.com', 'youtu.be'].includes(host) && key === 'si');
  }).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
};

/** Sanitize a URL carried directly or inside a `url:` canonical identity. */
export const publicCanonicalUrlIdentity = (value: string): string => {
  const normalized = value.trim();
  const hasPrefix = /^url:/iu.test(normalized);
  const url = hasPrefix ? normalized.slice(4).trimStart() : normalized;
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
      return true;
    }
    let normalized = decoded;
    try { normalized = new URL(decoded).href; } catch { /* It may be a decoded URL component. */ }
    if (sanitizeUrlCredentials(normalized) !== normalized) return true;
  }
  return false;
};

/** Only known redirect endpoints carry a URL in these query keys. */
const redirectDestinationKeys = (url: URL): ReadonlySet<string> => {
  const host = url.hostname.toLowerCase().replace(/\.+$/u, '').replace(/^www\./u, '');
  const path = url.pathname.replace(/\/+$/u, '') || '/';
  return (host === 'google.com' || host === 'google.co.uk') && path === '/url'
    ? new Set(['url', 'q']) : new Set();
};

const sanitizePublicRedirectUrl = (value: string, depth: number): string => {
  let parsed: URL;
  try {
    parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
  } catch {
    return '';
  }
  const outer = sanitizeUrlCredentials(parsed.href);
  try { parsed = new URL(outer); } catch { return ''; }
  const destinationKeys = redirectDestinationKeys(parsed);
  if (destinationKeys.size === 0 || !parsed.search) return outer;
  const queryStart = outer.indexOf('?');
  const queryEnd = outer.indexOf('#', queryStart);
  const rawQuery = outer.slice(queryStart + 1, queryEnd < 0 ? undefined : queryEnd);
  const retained = rawQuery.split('&').flatMap((component) => {
    const [name] = [...new URLSearchParams(component).keys()];
    if (!name || !destinationKeys.has(name.toLowerCase())) return [component];
    const destination = new URLSearchParams(component).get(name)?.trim() ?? '';
    // Invalid, oversized, or excessively nested destinations are discarded.
    if (depth >= maxRedirectDepth || destination.length > maxDestinationLength ||
        hasEncodedCredentialLayer(destination)) return [];
    const safe = sanitizePublicRedirectUrl(destination, depth + 1);
    if (!safe) return [];
    return safe === destination ? [component] : [`${component.slice(0, component.indexOf('='))}=${encodeURIComponent(safe)}`];
  });
  const suffix = queryEnd < 0 ? '' : outer.slice(queryEnd);
  return `${outer.slice(0, queryStart)}${retained.length ? `?${retained.join('&')}` : ''}${suffix}`;
};
