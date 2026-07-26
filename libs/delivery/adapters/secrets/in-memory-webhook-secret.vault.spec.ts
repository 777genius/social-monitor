import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryWebhookSecretVault } from './in-memory-webhook-secret.vault';

describe('InMemoryWebhookSecretVault', () => {
  it('returns a secret only for its owning tenant workspace', async () => {
    const vault = new InMemoryWebhookSecretVault();
    const owner = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      secretKeyId: 'secret-key-1',
    };

    await vault.put({ ...owner, secret: 'secret-value-1' });

    await expect(vault.get(owner)).resolves.toBe('secret-value-1');
    await expect(vault.get({
      ...owner,
      tenantId: tenantId('tenant-2'),
      workspaceId: workspaceId('workspace-2'),
    })).resolves.toBeNull();
  });

  it('rejects moving an existing secret key to another tenant workspace', async () => {
    const vault = new InMemoryWebhookSecretVault();

    await vault.put({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      secretKeyId: 'secret-key-1',
      secret: 'secret-value-1',
    });

    await expect(vault.put({
      tenantId: tenantId('tenant-2'),
      workspaceId: workspaceId('workspace-2'),
      secretKeyId: 'secret-key-1',
      secret: 'spoofed-secret-value',
    })).rejects.toThrow('already owned by another tenant workspace');
  });
});
