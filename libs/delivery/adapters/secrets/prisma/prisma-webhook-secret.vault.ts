import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';

import type { WebhookSecretVaultPort } from '../../../ports';
import type { PrismaDeliveryClient, PrismaWebhookSecretWriteData } from '../../persistence/prisma/prisma-delivery-client';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class PrismaWebhookSecretVault implements WebhookSecretVaultPort {
  constructor(
    private readonly prisma: PrismaDeliveryClient,
    private readonly key: Buffer,
  ) {
    if (key.byteLength !== KEY_BYTES) {
      throw new Error('Webhook secret encryption key must be 32 bytes');
    }
  }

  async put(params: Parameters<WebhookSecretVaultPort['put']>[0]): Promise<void> {
    const encrypted = encrypt(params.secret, this.key);
    const data: PrismaWebhookSecretWriteData = {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      algorithm: ALGORITHM,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
    };

    await withPrismaWriteRetry(() => this.prisma.webhookSecret.upsert({
      where: {
        id_tenantId_workspaceId: {
          id: params.secretKeyId,
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
        },
      },
      update: data,
      create: {
        id: params.secretKeyId,
        ...data,
      },
    }));
  }

  async get(params: Parameters<WebhookSecretVaultPort['get']>[0]): Promise<string | null> {
    const record = await this.prisma.webhookSecret.findUnique({
      where: {
        id_tenantId_workspaceId: {
          id: params.secretKeyId,
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
        },
      },
    });

    if (record === null) {
      return null;
    }

    if (record.algorithm !== ALGORITHM) {
      throw new Error(`Unsupported webhook secret algorithm: ${record.algorithm}`);
    }

    return decrypt({
      ciphertext: record.ciphertext,
      iv: record.iv,
      authTag: record.authTag,
    }, this.key);
  }
}

export const resolveWebhookSecretEncryptionKey = (env: NodeJS.ProcessEnv): Buffer => {
  const raw = env.DELIVERY_WEBHOOK_SECRET_ENCRYPTION_KEY;

  if (raw === undefined || raw.trim().length === 0) {
    throw new Error('DELIVERY_WEBHOOK_SECRET_ENCRYPTION_KEY is required when DELIVERY_PERSISTENCE=prisma');
  }

  const normalized = raw.trim().replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
  const key = Buffer.from(padded, 'base64');

  if (key.byteLength !== KEY_BYTES) {
    throw new Error('DELIVERY_WEBHOOK_SECRET_ENCRYPTION_KEY must decode to 32 bytes');
  }

  return key;
};

const encrypt = (
  secret: string,
  key: Buffer,
): Pick<PrismaWebhookSecretWriteData, 'algorithm' | 'ciphertext' | 'iv' | 'authTag'> => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);

  return {
    algorithm: ALGORITHM,
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
  };
};

const decrypt = (
  value: Pick<PrismaWebhookSecretWriteData, 'ciphertext' | 'iv' | 'authTag'>,
  key: Buffer,
): string => {
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(value.iv, 'base64url'));

  decipher.setAuthTag(Buffer.from(value.authTag, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};
