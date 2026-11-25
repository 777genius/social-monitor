import { DomainError, FixedClock } from '@social-monitor/shared-kernel';

import {
  createStoredSourceCredential,
  FakeSourceCredentialRefresher,
  FakeSourceCredentialRepository,
  FakeSourceCredentialVault,
  sourceCredentialTenant,
  sourceCredentialWorkspace,
} from '../source-credential-test-fixtures';
import { ResolveSourceCredentialUseCase } from './resolve-source-credential.use-case';

describe('ResolveSourceCredentialUseCase', () => {
  it('refreshes expired credentials and persists refreshed secret metadata', async () => {
    const repository = new FakeSourceCredentialRepository();
    const vault = new FakeSourceCredentialVault();
    const credential = await createStoredSourceCredential({
      repository,
      vault,
      expiresAt: new Date('2026-06-21T09:59:00.000Z'),
      secret: { accessToken: 'expired-token', refreshToken: 'refresh-token' },
    });
    const useCase = new ResolveSourceCredentialUseCase(
      repository,
      vault,
      new FakeSourceCredentialRefresher({
        refreshed: true,
        secret: { accessToken: 'fresh-token', refreshToken: 'refresh-token' },
        expiresAt: new Date('2026-06-21T11:00:00.000Z'),
        scopes: ['identity', 'read'],
      }),
      new FixedClock(new Date('2026-06-21T10:00:00.000Z')),
    );

    const result = await useCase.resolve({
      tenantId: sourceCredentialTenant,
      workspaceId: sourceCredentialWorkspace,
      sourceCredentialId: credential.toSnapshot().id,
      providerKey: 'reddit',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.accessToken).toBe('fresh-token');
    const refreshed = await repository.findById({
      tenantId: sourceCredentialTenant,
      workspaceId: sourceCredentialWorkspace,
      sourceCredentialId: credential.toSnapshot().id,
    });
    expect(refreshed?.toSnapshot().expiresAt?.toISOString()).toBe('2026-06-21T11:00:00.000Z');
  });

  it('returns a denied result when provider keys do not match', async () => {
    const repository = new FakeSourceCredentialRepository();
    const vault = new FakeSourceCredentialVault();
    const credential = await createStoredSourceCredential({ repository, vault });
    const useCase = new ResolveSourceCredentialUseCase(
      repository,
      vault,
      new FakeSourceCredentialRefresher({
        refreshed: false,
        secret: { accessToken: 'test-access-token' },
      }),
      new FixedClock(new Date('2026-06-21T10:00:00.000Z')),
    );

    const result = await useCase.resolve({
      tenantId: sourceCredentialTenant,
      workspaceId: sourceCredentialWorkspace,
      sourceCredentialId: credential.toSnapshot().id,
      providerKey: 'github',
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error instanceof DomainError && result.error.code).toBe('authorization.denied');
  });
});
