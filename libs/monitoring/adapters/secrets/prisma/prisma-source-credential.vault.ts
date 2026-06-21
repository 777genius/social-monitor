import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';

import type { SourceCredentialSecret, SourceCredentialVaultPort } from '../../../ports';
import type {
  PrismaMonitoringClient,
} from '../../persistence/prisma/prisma-monitoring-client';
import type {
  PrismaSourceCredentialSecretWriteData,
} from '../../persistence/prisma/prisma-monitoring-records';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class PrismaSourceCredentialVault implements SourceCredentialVaultPort {
  constructor(
    private readonly prisma: PrismaMonitoringClient,
    private readonly key: Buffer,
  ) {
    if (key.byteLength !== KEY_BYTES) {
      throw new Error('Source credential secret encryption key must be 32 bytes');
    }
  }

  async put(params: {
    readonly secretKeyId: string;
    readonly secret: SourceCredentialSecret;
  }): Promise<void> {
    const encrypted = encrypt(params.secret, this.key);
    const data: PrismaSourceCredentialSecretWriteData = {
      algorithm: ALGORITHM,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
    };

    await withPrismaWriteRetry(() => this.prisma.sourceCredentialSecret.upsert({
      where: { id: params.secretKeyId },
      update: data,
      create: {
        id: params.secretKeyId,
        ...data,
      },
    }));
  }

  async get(params: { readonly secretKeyId: string }): Promise<SourceCredentialSecret | null> {
    const record = await this.prisma.sourceCredentialSecret.findUnique({
      where: { id: params.secretKeyId },
    });

    if (record === null) {
      return null;
    }

    if (record.algorithm !== ALGORITHM) {
      throw new Error(`Unsupported source credential secret algorithm: ${record.algorithm}`);
    }

    return decrypt({
      ciphertext: record.ciphertext,
      iv: record.iv,
      authTag: record.authTag,
    }, this.key);
  }

  async delete(params: { readonly secretKeyId: string }): Promise<void> {
    try {
      await withPrismaWriteRetry(() => this.prisma.sourceCredentialSecret.delete({
        where: { id: params.secretKeyId },
      }));
    } catch (error) {
      if (error instanceof Error && /not found|No .* found/i.test(error.message)) {
        return;
      }

      throw error;
    }
  }
}

export const resolveSourceCredentialSecretEncryptionKey = (env: NodeJS.ProcessEnv): Buffer => {
  const raw = env.SOURCE_CREDENTIAL_SECRET_ENCRYPTION_KEY;

  if (raw === undefined || raw.trim().length === 0) {
    throw new Error('SOURCE_CREDENTIAL_SECRET_ENCRYPTION_KEY is required when MONITORING_PERSISTENCE=prisma');
  }

  const normalized = raw.trim().replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
  const key = Buffer.from(padded, 'base64');

  if (key.byteLength !== KEY_BYTES) {
    throw new Error('SOURCE_CREDENTIAL_SECRET_ENCRYPTION_KEY must decode to 32 bytes');
  }

  return key;
};

const encrypt = (secret: SourceCredentialSecret, key: Buffer): PrismaSourceCredentialSecretWriteData => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(secret), 'utf8'), cipher.final()]);

  return {
    algorithm: ALGORITHM,
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
  };
};

const decrypt = (
  value: Pick<PrismaSourceCredentialSecretWriteData, 'ciphertext' | 'iv' | 'authTag'>,
  key: Buffer,
): SourceCredentialSecret => {
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(value.iv, 'base64url'));

  decipher.setAuthTag(Buffer.from(value.authTag, 'base64url'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');

  return JSON.parse(plaintext) as SourceCredentialSecret;
};
