import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

import type {
  SourceBindingConfig,
  SourceBindingConfigProtectorPort,
  SourceBindingConfigValue,
} from '../../ports/source-binding-config-protector.port';

const algorithm = 'aes-256-gcm';
const keyBytes = 32;

type EncryptedConfigValue = {
  readonly encrypted: true;
  readonly algorithm: 'aes-256-gcm';
  readonly keyId: string;
  readonly iv: string;
  readonly ciphertext: string;
  readonly authTag: string;
};

const secretKeyPattern = /(?:secret|token|password|credential|authorization|api[_-]?key|refresh[_-]?token|access[_-]?token)/i;

export class AesGcmSourceBindingConfigProtector implements SourceBindingConfigProtectorPort {
  constructor(
    private readonly key: Buffer,
    private readonly keyId: string,
  ) {
    if (key.length !== keyBytes) {
      throw new Error('Source credential encryption key must be 32 bytes');
    }
  }

  static withEphemeralDevelopmentKey(): AesGcmSourceBindingConfigProtector {
    return new AesGcmSourceBindingConfigProtector(randomBytes(keyBytes), 'local-ephemeral');
  }

  static fromBase64Key(encodedKey: string, keyId = 'env'): AesGcmSourceBindingConfigProtector {
    return new AesGcmSourceBindingConfigProtector(decodeBase64Key(encodedKey), keyId);
  }

  static fromEnvironment(env: NodeJS.ProcessEnv): AesGcmSourceBindingConfigProtector {
    const raw = env.SOURCE_CONFIG_ENCRYPTION_KEY;

    if (raw === undefined || raw.trim().length === 0) {
      if (env.NODE_ENV === 'production') {
        throw new Error('SOURCE_CONFIG_ENCRYPTION_KEY is required in production');
      }

      return AesGcmSourceBindingConfigProtector.withEphemeralDevelopmentKey();
    }

    return AesGcmSourceBindingConfigProtector.fromBase64Key(
      raw,
      env.SOURCE_CONFIG_ENCRYPTION_KEY_ID?.trim() || 'env',
    );
  }

  async protect(config: SourceBindingConfig): Promise<SourceBindingConfig> {
    return this.protectObject(config);
  }

  async unprotect(config: SourceBindingConfig): Promise<SourceBindingConfig> {
    return this.unprotectObject(config);
  }

  private protectObject(config: SourceBindingConfig): SourceBindingConfig {
    return Object.fromEntries(
      Object.entries(config).map(([key, value]) => [key, this.protectValue(key, value)]),
    );
  }

  private protectValue(key: string, value: SourceBindingConfigValue): SourceBindingConfigValue | EncryptedConfigValue {
    if (secretKeyPattern.test(key)) {
      return this.encrypt(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.protectNestedValue(item));
    }

    if (isConfigObject(value)) {
      return this.protectObject(value);
    }

    return value;
  }

  private protectNestedValue(value: SourceBindingConfigValue): SourceBindingConfigValue {
    if (Array.isArray(value)) {
      return value.map((item) => this.protectNestedValue(item));
    }

    if (isConfigObject(value)) {
      return this.protectObject(value);
    }

    return value;
  }

  private unprotectObject(config: SourceBindingConfig): SourceBindingConfig {
    return Object.fromEntries(
      Object.entries(config).map(([key, value]) => [key, this.unprotectValue(value)]),
    );
  }

  private unprotectValue(value: SourceBindingConfigValue): SourceBindingConfigValue {
    if (isEncryptedConfigValue(value)) {
      return this.decrypt(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.unprotectValue(item));
    }

    if (isConfigObject(value)) {
      return this.unprotectObject(value);
    }

    return value;
  }

  private encrypt(value: SourceBindingConfigValue): EncryptedConfigValue {
    const iv = randomBytes(12);
    const cipher = createCipheriv(algorithm, this.key, iv);
    const plaintext = JSON.stringify(value);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    return {
      encrypted: true,
      algorithm,
      keyId: this.keyId,
      iv: iv.toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
      authTag: cipher.getAuthTag().toString('base64url'),
    };
  }

  private decrypt(value: EncryptedConfigValue): SourceBindingConfigValue {
    if (value.keyId !== this.keyId) {
      throw new Error(`Source credential key mismatch: ${value.keyId}`);
    }

    const decipher = createDecipheriv(
      algorithm,
      this.key,
      Buffer.from(value.iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(value.authTag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');

    return JSON.parse(plaintext) as SourceBindingConfigValue;
  }
}

const isConfigObject = (value: SourceBindingConfigValue): value is SourceBindingConfig =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isEncryptedConfigValue = (value: SourceBindingConfigValue): value is EncryptedConfigValue => {
  if (!isConfigObject(value)) {
    return false;
  }

  return (
    value.encrypted === true &&
    value.algorithm === 'aes-256-gcm' &&
    typeof value.keyId === 'string' &&
    typeof value.iv === 'string' &&
    typeof value.ciphertext === 'string' &&
    typeof value.authTag === 'string'
  );
};

const decodeBase64Key = (encodedKey: string): Buffer => {
  const raw = encodedKey.trim();
  const normalized = raw.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
  const key = Buffer.from(padded, 'base64');

  if (key.length !== keyBytes) {
    throw new Error('SOURCE_CONFIG_ENCRYPTION_KEY must decode to 32 bytes');
  }

  return key;
};
