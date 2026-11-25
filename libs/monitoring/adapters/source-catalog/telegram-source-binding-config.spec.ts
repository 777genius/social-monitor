import type { SourceBindingConfig } from '../../ports';
import { FakeSourceCatalogAdapter } from './fake-source-catalog.adapter';
import { sourceBindingScanQuery } from '../../features/shared/source-binding-scan-query';

describe('Telegram source binding contract', () => {
  const catalog = new FakeSourceCatalogAdapter({ includeFixtureProviders: false });
  it('binds a public channel in the beta catalog and builds an account feed query', async () => {
    const config = { mode: 'account_feed', channel: '@Example_Channel', maxItems: 10, maxPages: 2 };
    expect(await catalog.getCapability('telegram')).toMatchObject({ providerKey: 'telegram', supportsCursor: true });
    expect(await catalog.validateBindingConfig('telegram', config)).toEqual({
      ok: true,
      normalizedConfig: { ...config, channel: 'example_channel' },
      configIdentity: { field: 'channel', value: 'example_channel' },
    });
    expect(sourceBindingScanQuery({ id: 'binding', providerKey: 'telegram', config })).toEqual({ mode: 'account_feed', query: '@Example_Channel' });
  });
  it('normalizes equivalent username, query and preview URL inputs together', async () => {
    expect(await catalog.validateBindingConfig('telegram', {
      channel: '@Example_Channel', query: 'EXAMPLE_CHANNEL', url: 'https://t.me/s/Example_Channel/',
    })).toEqual({
      ok: true,
      normalizedConfig: {
        channel: 'example_channel', query: 'example_channel', url: 'https://t.me/example_channel',
      },
      configIdentity: { field: 'channel', value: 'example_channel' },
    });
  });
  it.each<SourceBindingConfig>([
    { channel: 'https://t.me/+invite' },
    { channel: '@example_channel', url: 'https://other.example/channel' },
    { channel: '@example_channel', query: '@another_channel' },
    { channel: '@example_channel', mode: 'search' },
    { channel: '@example_channel', botToken: 'synthetic' },
    { channel: '@example_channel', maxPages: 0 },
  ])('rejects unavailable scopes, credentials and invalid budgets: %o', async (config) => {
    expect(await catalog.validateBindingConfig('telegram', config)).toMatchObject({ ok: false });
  });
});
