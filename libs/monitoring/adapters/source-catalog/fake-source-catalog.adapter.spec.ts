import { FakeSourceCatalogAdapter } from './fake-source-catalog.adapter';

describe('FakeSourceCatalogAdapter', () => {
  it('exposes canonical x-twitter as a production-safe monitoring source', async () => {
    const catalog = new FakeSourceCatalogAdapter({ includeFixtureProviders: false });

    await expect(catalog.getCapability('x-twitter')).resolves.toEqual({
      providerKey: 'x-twitter',
      version: 1,
      productionSafe: true,
      supportsCursor: true,
    });
    await expect(catalog.getCapability('x-twitter-experimental-daily')).resolves.toEqual(
      expect.objectContaining({ providerKey: 'x-twitter' }),
    );
  });

  it('validates X daily search config and rejects unsupported modes or products', async () => {
    const catalog = new FakeSourceCatalogAdapter({ includeFixtureProviders: false });

    await expect(catalog.validateBindingConfig('x-twitter', {
      mode: 'search',
      query: 'openai agents',
      windowHours: 24,
      searchProducts: ['top', 'latest'],
      maxItems: 25,
      limitPerProduct: 50,
      minLikes: 1,
      minRetweets: 0,
      minReplies: 0,
    })).resolves.toEqual({ ok: true });

    await expect(catalog.validateBindingConfig('x-twitter', {
      mode: 'listing',
      query: 'openai agents',
    })).resolves.toEqual({
      ok: false,
      reason: 'Unsupported X/Twitter query mode: listing',
    });

    await expect(catalog.validateBindingConfig('x-twitter', {
      mode: 'search',
      query: 'openai agents',
      searchProducts: ['live'],
    })).resolves.toEqual({
      ok: false,
      reason: 'Unsupported X/Twitter search product: live',
    });
  });
});
