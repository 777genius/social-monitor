import { FixedClock } from '@social-monitor/shared-kernel';

import {
  createStoredSourceCredential,
  FakeSourceCredentialRepository,
  FakeSourceCredentialVault,
  sourceCredentialTenant,
  sourceCredentialWorkspace,
} from '../source-credential-test-fixtures';
import { RevokeSourceCredentialUseCase } from './revoke-source-credential.use-case';

describe('RevokeSourceCredentialUseCase', () => {
  it('revokes metadata and removes active secret material', async () => {
    const repository = new FakeSourceCredentialRepository();
    const vault = new FakeSourceCredentialVault();
    const credential = await createStoredSourceCredential({
      repository,
      vault,
      secretKeyId: 'secret-to-revoke',
    });

    const result = await new RevokeSourceCredentialUseCase(
      repository,
      vault,
      new FixedClock(new Date('2026-06-21T11:00:00.000Z')),
    ).execute({
      tenantId: sourceCredentialTenant,
      workspaceId: sourceCredentialWorkspace,
      sourceCredentialId: credential.toSnapshot().id,
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.sourceCredential.status).toBe('revoked');
    expect(await vault.get({ secretKeyId: 'secret-to-revoke' })).toBeNull();
  });
});
