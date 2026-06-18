export type OutboundUrlPolicyResult =
  | { readonly ok: true; readonly url: URL }
  | { readonly ok: false; readonly reason: string };

export type OutboundUrlProtocol = 'http:' | 'https:';

export type OutboundUrlPolicyOptions = {
  readonly label: string;
  readonly allowedProtocols: readonly OutboundUrlProtocol[];
};

const blockedHosts = new Set(['localhost', 'localhost.localdomain']);

export const validateOutboundUrl = (
  value: string,
  options: OutboundUrlPolicyOptions,
): OutboundUrlPolicyResult => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: `${options.label} must be absolute.` };
  }

  if (!options.allowedProtocols.includes(url.protocol as OutboundUrlProtocol)) {
    return { ok: false, reason: `${options.label} must use ${formatAllowedProtocols(options.allowedProtocols)}.` };
  }

  const hostname = url.hostname.toLowerCase();

  if (blockedHosts.has(hostname) || hostname.endsWith('.localhost')) {
    return { ok: false, reason: `${options.label} host is not allowed.` };
  }

  if (isPrivateOrLocalNetworkHost(hostname)) {
    return { ok: false, reason: `${options.label} must not target private or local networks.` };
  }

  return { ok: true, url };
};

const formatAllowedProtocols = (protocols: readonly OutboundUrlProtocol[]): string => {
  const normalized = protocols.map((protocol) => protocol.replace(':', ''));

  return normalized.length === 1 ? normalized[0] ?? 'https' : normalized.join(' or ');
};

const isPrivateOrLocalNetworkHost = (hostname: string): boolean => {
  const parts = hostname.split('.').map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return isPrivateIpv6Host(hostname);
  }

  const [first, second] = parts;

  if (first === undefined || second === undefined) {
    return false;
  }

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
};

const isPrivateIpv6Host = (hostname: string): boolean => {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('::ffff:') ||
    normalized.startsWith('64:ff9b:') ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd')
  );
};
