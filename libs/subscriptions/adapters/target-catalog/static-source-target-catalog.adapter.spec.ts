import { StaticSourceTargetCatalogAdapter } from './static-source-target-catalog.adapter';

describe('StaticSourceTargetCatalogAdapter', () => {
  it('canonicalizes legacy X provider targets to x-twitter', () => {
    const result = new StaticSourceTargetCatalogAdapter().validateTarget({
      providerKey: 'x-twitter-experimental-daily',
      targetKind: 'search_query',
      targetValue: ' OpenAI   Agents ',
      config: {},
    });

    expect(result).toEqual({
      ok: true,
      descriptor: {
        providerKey: 'x-twitter',
        targetKind: 'search_query',
        targetValue: 'openai agents',
        normalizedKey: 'x-twitter:search_query:openai agents',
        config: {},
      },
    });
  });

  it('normalizes X account targets without leaking account feed semantics', () => {
    const result = new StaticSourceTargetCatalogAdapter().validateTarget({
      providerKey: 'X-Twitter',
      targetKind: 'account',
      targetValue: '@OpenAI',
      config: {},
    });

    expect(result).toEqual({
      ok: true,
      descriptor: expect.objectContaining({
        providerKey: 'x-twitter',
        targetKind: 'account',
        targetValue: 'openai',
        normalizedKey: 'x-twitter:account:openai',
      }),
    });
  });
});
