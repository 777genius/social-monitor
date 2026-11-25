import type { PrismaDeliveryClient } from '../../libs/delivery/adapters/persistence/prisma/prisma-delivery-client';
import type { PrismaWebhookSecretRecord } from '../../libs/delivery/adapters/persistence/prisma/prisma-delivery-records';

export const createFakePrismaWebhookSecretDelegate = (
): PrismaDeliveryClient['webhookSecret'] => {
  const records = new Map<string, PrismaWebhookSecretRecord>();

  return {
    upsert: async (args) => {
      const identity = args.where.id_tenantId_workspaceId;
      const existing = records.get(identity.id);

      if (
        existing !== undefined &&
        (
          existing.tenantId !== identity.tenantId ||
          existing.workspaceId !== identity.workspaceId
        )
      ) {
        throw Object.assign(
          new Error('Webhook secret tenant workspace constraint violation'),
          { code: 'P2002' },
        );
      }

      const record: PrismaWebhookSecretRecord = {
        id: existing?.id ?? args.create.id,
        tenantId: args.update.tenantId,
        workspaceId: args.update.workspaceId,
        algorithm: args.update.algorithm,
        ciphertext: args.update.ciphertext,
        iv: args.update.iv,
        authTag: args.update.authTag,
      };
      records.set(record.id, record);

      return record;
    },
    findUnique: async (args) => {
      const identity = args.where.id_tenantId_workspaceId;
      const record = records.get(identity.id);

      return record?.tenantId === identity.tenantId &&
        record.workspaceId === identity.workspaceId
        ? record
        : null;
    },
  };
};
