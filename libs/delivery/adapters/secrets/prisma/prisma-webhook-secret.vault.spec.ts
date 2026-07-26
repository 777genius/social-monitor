import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { PrismaDeliveryClient } from '../../persistence/prisma/prisma-delivery-client';
import type { PrismaWebhookSecretRecord } from '../../persistence/prisma/prisma-delivery-records';
import { PrismaWebhookSecretVault } from './prisma-webhook-secret.vault';

describe('PrismaWebhookSecretVault', () => {
  it('writes and reads secrets through the tenant workspace composite identity', async () => {
    let persisted: PrismaWebhookSecretRecord | null = null;
    const upsert = jest.fn<Promise<PrismaWebhookSecretRecord>, [
      Parameters<PrismaDeliveryClient['webhookSecret']['upsert']>[0],
    ]>(async (args) => {
      persisted = {
        ...args.create,
      };
      return persisted;
    });
    const findUnique = jest.fn<Promise<PrismaWebhookSecretRecord | null>, [
      Parameters<PrismaDeliveryClient['webhookSecret']['findUnique']>[0],
    ]>(async () => persisted);
    const prisma = {
      webhookSecret: {
        upsert,
        findUnique,
      },
    } as unknown as PrismaDeliveryClient;
    const vault = new PrismaWebhookSecretVault(prisma, Buffer.alloc(32, 7));
    const scope = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      secretKeyId: 'secret-key-1',
    };

    await vault.put({
      ...scope,
      secret: 'secret-value-1',
    });

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id_tenantId_workspaceId: {
          id: scope.secretKeyId,
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
        },
      },
      create: expect.objectContaining({
        id: scope.secretKeyId,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
      }),
    }));
    expect((persisted as PrismaWebhookSecretRecord | null)?.ciphertext)
      .not.toContain('secret-value-1');
    await expect(vault.get(scope)).resolves.toBe('secret-value-1');
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        id_tenantId_workspaceId: {
          id: scope.secretKeyId,
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
        },
      },
    });
  });
});
