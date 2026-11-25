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

  it('rejects inline credential fields in source target config before persistence or presentation', () => {
    const result = new StaticSourceTargetCatalogAdapter().validateTarget({
      providerKey: 'reddit',
      targetKind: 'subreddit',
      targetValue: 'programming',
      config: {
        listing: 'hot',
        accessToken: 'raw-access-token',
      },
    });

    expect(result).toEqual({
      ok: false,
      reason: 'Source target config must reference stored credentials instead of inline credential field: accessToken',
    });
  });

  it('rejects nested inline credential fields in source target config', () => {
    const result = new StaticSourceTargetCatalogAdapter().validateTarget({
      providerKey: 'github',
      targetKind: 'search_query',
      targetValue: 'ai agents',
      config: {
        auth: {
          clientSecret: 'raw-client-secret',
        },
      },
    });

    expect(result).toEqual({
      ok: false,
      reason: 'Source target config must reference stored credentials instead of inline credential field: auth.clientSecret',
    });
  });

  it('allows stored credential references without treating credential ids as secret material', () => {
    const result = new StaticSourceTargetCatalogAdapter().validateTarget({
      providerKey: 'reddit',
      targetKind: 'subreddit',
      targetValue: 'programming',
      config: {
        listing: 'hot',
        credentialRef: {
          sourceCredentialId: 'source-credential-1',
        },
        sourceCredentialId: 'source-credential-1',
      },
    });

    expect(result).toEqual({
      ok: true,
      descriptor: expect.objectContaining({
        providerKey: 'reddit',
        targetKind: 'subreddit',
        targetValue: 'programming',
        config: {
          listing: 'hot',
          credentialRef: {
            sourceCredentialId: 'source-credential-1',
          },
          sourceCredentialId: 'source-credential-1',
        },
      }),
    });
  });
});
