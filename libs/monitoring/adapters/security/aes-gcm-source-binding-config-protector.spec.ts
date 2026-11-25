import { AesGcmSourceBindingConfigProtector } from './aes-gcm-source-binding-config-protector';

describe('AesGcmSourceBindingConfigProtector', () => {
  it('encrypts secret-like fields recursively while preserving safe config', async () => {
    const protector = new AesGcmSourceBindingConfigProtector(Buffer.alloc(32, 1), 'test-key');

    const protectedConfig = await protector.protect({
      query: 'openai monitoring',
      apiToken: 'raw-token',
      nested: {
        password: 'raw-password',
        safe: 'visible',
      },
      headers: [
        {
          authorization: 'Bearer raw-token',
        },
      ],
    });

    expect(protectedConfig).toMatchObject({
      query: 'openai monitoring',
      apiToken: {
        encrypted: true,
        algorithm: 'aes-256-gcm',
        keyId: 'test-key',
        iv: expect.any(String),
        ciphertext: expect.any(String),
        authTag: expect.any(String),
      },
      nested: {
        password: {
          encrypted: true,
          algorithm: 'aes-256-gcm',
          keyId: 'test-key',
        },
        safe: 'visible',
      },
      headers: [
        {
          authorization: {
            encrypted: true,
            algorithm: 'aes-256-gcm',
            keyId: 'test-key',
          },
        },
      ],
    });
    expect(JSON.stringify(protectedConfig)).not.toContain('raw-token');
    expect(JSON.stringify(protectedConfig)).not.toContain('raw-password');

    await expect(protector.unprotect(protectedConfig)).resolves.toEqual({
      query: 'openai monitoring',
      apiToken: 'raw-token',
      nested: {
        password: 'raw-password',
        safe: 'visible',
      },
      headers: [
        {
          authorization: 'Bearer raw-token',
        },
      ],
    });
  });

  it('requires a persistent encryption key in beta runtime', () => {
    expect(() =>
      AesGcmSourceBindingConfigProtector.fromEnvironment({
        SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta',
      }),
    ).toThrow('SOURCE_CONFIG_ENCRYPTION_KEY is required when SOCIAL_MONITOR_RUNTIME_PROFILE=beta');
    expect(() =>
      AesGcmSourceBindingConfigProtector.fromEnvironment({
        NODE_ENV: 'staging',
      }),
    ).toThrow('SOURCE_CONFIG_ENCRYPTION_KEY is required when SOCIAL_MONITOR_RUNTIME_PROFILE=beta');
    expect(() =>
      AesGcmSourceBindingConfigProtector.fromEnvironment({
        NODE_ENV: 'test',
      }),
    ).not.toThrow();
  });
});
