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
});
