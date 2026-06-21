import { FixedClock } from '@social-monitor/shared-kernel';

import {
  FakeSourceCredentialRepository,
  FakeSourceCredentialVault,
  SequenceIdGenerator,
  sourceCredentialTenant,
  sourceCredentialWorkspace,
} from '../source-credential-test-fixtures';
import { CreateSourceCredentialUseCase } from './create-source-credential.use-case';

describe('CreateSourceCredentialUseCase', () => {
  it('stores credential metadata separately from secret material', async () => {
    const repository = new FakeSourceCredentialRepository();
    const vault = new FakeSourceCredentialVault();
    const useCase = new CreateSourceCredentialUseCase(
      repository,
      vault,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-21T10:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: sourceCredentialTenant,
      workspaceId: sourceCredentialWorkspace,
      providerKey: 'github',
      kind: 'oauth2',
      secret: { accessToken: 'raw-access-token' },
      scopes: ['read'],
      secretPreview: 'reddit-token',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.sourceCredential.secretPreview).toBe('reddit-token');
    expect(JSON.stringify(result)).not.toContain('raw-access-token');
    expect(vault.secrets.size).toBe(1);
  });

  it('normalizes Reddit OAuth credentials for recurring refresh-token scans', async () => {
    const repository = new FakeSourceCredentialRepository();
    const vault = new FakeSourceCredentialVault();
    const result = await new CreateSourceCredentialUseCase(
      repository,
      vault,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-21T10:00:00.000Z')),
    ).execute({
      tenantId: sourceCredentialTenant,
      workspaceId: sourceCredentialWorkspace,
      providerKey: 'reddit',
      kind: 'oauth2',
      secret: {
        clientId: 'reddit-client-id',
        refreshToken: 'reddit-refresh-token',
      },
      scopes: ['read', 'identity'],
      secretPreview: 'reddit-client',
    });

    expect(result.ok).toBe(true);
    expect([...vault.secrets.values()]).toEqual([{
      clientId: 'reddit-client-id',
      refreshToken: 'reddit-refresh-token',
      tokenUrl: 'https://www.reddit.com/api/v1/access_token',
    }]);
    expect(JSON.stringify(result)).not.toContain('reddit-refresh-token');
  });

  it('rejects Reddit OAuth credentials that cannot refresh recurring scans', async () => {
    const result = await new CreateSourceCredentialUseCase(
      new FakeSourceCredentialRepository(),
      new FakeSourceCredentialVault(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-21T10:00:00.000Z')),
    ).execute({
      tenantId: sourceCredentialTenant,
      workspaceId: sourceCredentialWorkspace,
      providerKey: 'reddit',
      kind: 'oauth2',
      secret: { accessToken: 'short-lived-access-token' },
      scopes: ['read'],
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('refreshToken');
  });
});
