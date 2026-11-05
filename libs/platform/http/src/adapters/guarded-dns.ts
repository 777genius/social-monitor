import { lookup } from 'node:dns/promises';
import { isIP, type LookupFunction } from 'node:net';
import { validateOutboundUrl } from '@social-monitor/shared-kernel';

import { OutboundHttpPolicyError } from '../outbound-http-policy-error';

export const assertPublicAddress = (address: string): void => {
  const family = isIP(address);
  if (!family) {
    throw new OutboundHttpPolicyError('invalid_dns_result', 'Outbound target did not resolve to an IP address');
  }
  const validation = validateOutboundUrl(`http://${family === 6 ? `[${address}]` : address}/`, {
    label: 'Outbound target', allowedProtocols: ['http:'],
  });
  if (!validation.ok) throw new OutboundHttpPolicyError('unsafe_target', validation.reason);
};

const normalizedAddress = (address: string): string =>
  isIP(address) === 6 ? new URL(`http://[${address}]/`).hostname : address;

/** Pin validated answers in the actual socket lookup, never in a detached DNS precheck. */
export const createGuardedDnsLookup = (url: URL, signal: AbortSignal): {
  readonly lookup: LookupFunction;
  readonly assertPeer: (address: string | undefined) => void;
} => {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const pinned = new Set<string>();
  if (isIP(hostname)) {
    assertPublicAddress(hostname);
    pinned.add(normalizedAddress(hostname));
  }

  return {
    lookup: (host, options, callback) => {
      void lookup(host, { all: true, verbatim: true }).then((addresses) => {
        signal.throwIfAborted();
        if (addresses.length === 0) throw new Error('Outbound target has no addresses');
        // Reject mixed public/private answers too; address selection must not
        // turn a failed safety check into a connection to a different answer.
        for (const record of addresses) assertPublicAddress(record.address);
        for (const record of addresses) pinned.add(normalizedAddress(record.address));
        if (options.all) callback(null, addresses);
        else callback(null, addresses[0]!.address, addresses[0]!.family);
      }).catch((error: Error) => callback(error, '', 4));
    },
    assertPeer: (address) => {
      signal.throwIfAborted();
      if (address === undefined || !pinned.has(normalizedAddress(address))) {
        throw new OutboundHttpPolicyError('unsafe_connection', 'Outbound connection did not match the guarded DNS result');
      }
    },
  };
};
