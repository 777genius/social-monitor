import { validateOutboundUrl } from './outbound-url-policy';

describe('validateOutboundUrl', () => {
  it('accepts public HTTPS URLs', () => {
    expect(validateOutboundUrl('https://example.com/webhook', {
      label: 'Webhook endpoint URL',
      allowedProtocols: ['https:'],
    })).toEqual({
      ok: true,
      url: new URL('https://example.com/webhook'),
    });
  });

  it('rejects local and private network targets', () => {
    const options = {
      label: 'Outbound URL',
      allowedProtocols: ['http:', 'https:'],
    } as const;

    expect(validateOutboundUrl('https://localhost/webhook', options)).toEqual({
      ok: false,
      reason: 'Outbound URL host is not allowed.',
    });
    expect(validateOutboundUrl('https://127.0.0.1/webhook', options)).toEqual({
      ok: false,
      reason: 'Outbound URL must not target private or local networks.',
    });
    expect(validateOutboundUrl('https://169.254.169.254/latest/meta-data', options)).toEqual({
      ok: false,
      reason: 'Outbound URL must not target private or local networks.',
    });
    expect(validateOutboundUrl('https://[::1]/webhook', options)).toEqual({
      ok: false,
      reason: 'Outbound URL must not target private or local networks.',
    });
    expect(validateOutboundUrl('https://2130706433/webhook', options)).toEqual({
      ok: false,
      reason: 'Outbound URL must not target private or local networks.',
    });
    expect(validateOutboundUrl('https://0x7f000001/webhook', options)).toEqual({
      ok: false,
      reason: 'Outbound URL must not target private or local networks.',
    });
    expect(validateOutboundUrl('https://[::ffff:127.0.0.1]/webhook', options)).toEqual({
      ok: false,
      reason: 'Outbound URL must not target private or local networks.',
    });
  });

  it('enforces protocol allowlists', () => {
    expect(validateOutboundUrl('http://example.com/feed.xml', {
      label: 'Webhook endpoint URL',
      allowedProtocols: ['https:'],
    })).toEqual({
      ok: false,
      reason: 'Webhook endpoint URL must use https.',
    });

    expect(validateOutboundUrl('file:///tmp/feed.xml', {
      label: 'Feed URL',
      allowedProtocols: ['http:', 'https:'],
    })).toEqual({
      ok: false,
      reason: 'Feed URL must use http or https.',
    });
  });
});
