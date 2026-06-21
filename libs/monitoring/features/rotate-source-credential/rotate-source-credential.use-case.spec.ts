import { FixedClock } from '@social-monitor/shared-kernel';

import {
  createStoredSourceCredential,
  FakeSourceCredentialRepository,
  FakeSourceCredentialVault,
  SequenceIdGenerator,
  sourceCredentialTenant,
  sourceCredentialWorkspace,
} from '../source-credential-test-fixtures';
import { RotateSourceCredentialUseCase } from './rotate-source-credential.use-case';

describe('RotateSourceCredentialUseCase', () => {
  it('rotates secret material and deletes the previous vault entry', async () => {
    const repository = new FakeSourceCredentialRepository();
    const vault = new FakeSourceCredentialVault();
    const credential = await createStoredSourceCredential({
      repository,
      vault,
      secretKeyId: 'old-secret-key',
      providerKey: 'github',
      secret: { accessToken: 'old-token' },
    });

    const result = await new RotateSourceCredentialUseCase(
      repository,
      vault,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-21T11:00:00.000Z')),
    ).execute({
      tenantId: sourceCredentialTenant,
      workspaceId: sourceCredentialWorkspace,
      sourceCredentialId: credential.toSnapshot().id,
      secret: { accessToken: 'new-token' },
      secretPreview: 'new-token',
    });

    expect(result.ok).toBe(true);
    expect(await vault.get({ secretKeyId: 'old-secret-key' })).toBeNull();
    expect([...vault.secrets.values()]).toEqual([{ accessToken: 'new-token' }]);
  });

  it('rejects rotating Reddit OAuth credentials to access-token-only material', async () => {
    const repository = new FakeSourceCredentialRepository();
    const vault = new FakeSourceCredentialVault();
    const credential = await createStoredSourceCredential({
      repository,
      vault,
      secretKeyId: 'old-secret-key',
      secret: {
        clientId: 'reddit-client-id',
        refreshToken: 'old-reddit-refresh-token',
      },
    });

    const result = await new RotateSourceCredentialUseCase(
      repository,
      vault,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-21T11:00:00.000Z')),
    ).execute({
      tenantId: sourceCredentialTenant,
      workspaceId: sourceCredentialWorkspace,
      sourceCredentialId: credential.toSnapshot().id,
      secret: { accessToken: 'short-lived-access-token' },
      secretPreview: 'short-lived',
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('refreshToken');
    expect(await vault.get({ secretKeyId: 'old-secret-key' })).toEqual({
      clientId: 'reddit-client-id',
      refreshToken: 'old-reddit-refresh-token',
    });
  });

  it('normalizes rotated Reddit OAuth credentials with the Reddit token endpoint', async () => {
    const repository = new FakeSourceCredentialRepository();
    const vault = new FakeSourceCredentialVault();
    const credential = await createStoredSourceCredential({
      repository,
      vault,
      secretKeyId: 'old-secret-key',
      secret: {
        clientId: 'reddit-client-id',
        refreshToken: 'old-reddit-refresh-token',
      },
    });

    const result = await new RotateSourceCredentialUseCase(
      repository,
      vault,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-21T11:00:00.000Z')),
    ).execute({
      tenantId: sourceCredentialTenant,
      workspaceId: sourceCredentialWorkspace,
      sourceCredentialId: credential.toSnapshot().id,
      secret: {
        clientId: 'reddit-client-id',
        refreshToken: 'new-reddit-refresh-token',
      },
      secretPreview: 'new-reddit',
    });

    expect(result.ok).toBe(true);
    expect(await vault.get({ secretKeyId: 'old-secret-key' })).toBeNull();
    expect([...vault.secrets.values()]).toEqual([{
      clientId: 'reddit-client-id',
      refreshToken: 'new-reddit-refresh-token',
      tokenUrl: 'https://www.reddit.com/api/v1/access_token',
    }]);
  });
});
