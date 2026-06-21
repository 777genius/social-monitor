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
      providerKey: 'reddit',
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
});
