import { AesGcmSourceBindingConfigProtector } from '../libs/monitoring/adapters/security/aes-gcm-source-binding-config-protector';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const protector = new AesGcmSourceBindingConfigProtector(Buffer.alloc(32, 1), 'source-config-smoke-key');
  const protectedConfig = await protector.protect({
    query: 'reddit observability',
    accessToken: 'raw-access-token',
    nested: {
      refreshToken: 'raw-refresh-token',
      visible: 'safe-value',
    },
  });
  const serialized = JSON.stringify(protectedConfig);

  assert(!serialized.includes('raw-access-token'), 'protected config must not expose access token');
  assert(!serialized.includes('raw-refresh-token'), 'protected config must not expose refresh token');

  const unprotectedConfig = await protector.unprotect(protectedConfig);
  assert(unprotectedConfig.query === 'reddit observability', 'safe config must round-trip');
  assert(unprotectedConfig.accessToken === 'raw-access-token', 'access token must decrypt');

  const nested = unprotectedConfig.nested as Readonly<Record<string, unknown>> | undefined;
  assert(nested?.refreshToken === 'raw-refresh-token', 'nested refresh token must decrypt');
  assert(nested.visible === 'safe-value', 'nested safe value must round-trip');

  console.log('Source config protector smoke OK');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
