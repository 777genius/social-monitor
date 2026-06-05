export type FeedUrlPolicyResult =
  | { readonly ok: true; readonly url: URL }
  | { readonly ok: false; readonly reason: string };

const blockedHosts = new Set(['localhost', 'localhost.localdomain']);

export const validateFeedUrl = (value: string): FeedUrlPolicyResult => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'Feed URL must be absolute.' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'Feed URL must use http or https.' };
  }

  const hostname = url.hostname.toLowerCase();

  if (blockedHosts.has(hostname) || hostname.endsWith('.localhost')) {
    return { ok: false, reason: 'Feed URL host is not allowed.' };
  }

  if (isPrivateIp(hostname)) {
    return { ok: false, reason: 'Feed URL must not target private or local networks.' };
  }

  return { ok: true, url };
};

const isPrivateIp = (hostname: string): boolean => {
  const parts = hostname.split('.').map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return hostname === '::1' || hostname.startsWith('fe80:') || hostname.startsWith('fc') || hostname.startsWith('fd');
  }

  const [first, second] = parts;

  if (first === undefined || second === undefined) {
    return false;
  }

  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    first === 0
  );
};
