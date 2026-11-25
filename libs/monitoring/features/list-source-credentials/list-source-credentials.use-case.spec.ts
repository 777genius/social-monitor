import {
  createStoredSourceCredential,
  FakeSourceCredentialRepository,
  FakeSourceCredentialVault,
  sourceCredentialTenant,
  sourceCredentialWorkspace,
} from '../source-credential-test-fixtures';
import { ListSourceCredentialsUseCase } from './list-source-credentials.use-case';

describe('ListSourceCredentialsUseCase', () => {
  it('lists source credentials without secret material', async () => {
    const repository = new FakeSourceCredentialRepository();
    const vault = new FakeSourceCredentialVault();
    await createStoredSourceCredential({
      repository,
      vault,
      secret: { accessToken: 'raw-access-token' },
    });

    const result = await new ListSourceCredentialsUseCase(repository).execute({
      tenantId: sourceCredentialTenant,
      workspaceId: sourceCredentialWorkspace,
      limit: 10,
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.sourceCredentials).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('raw-access-token');
  });
});
