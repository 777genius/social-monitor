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
  const hasPrefix = /^url:https?:\/\//iu.test(value);
  const url = hasPrefix ? value.slice(4) : value;
  if (!/^https?:\/\//iu.test(url)) return value;
  const sanitized = sanitizeUrlCredentials(url);
  return hasPrefix ? `url:${sanitized}` : sanitized;
};
