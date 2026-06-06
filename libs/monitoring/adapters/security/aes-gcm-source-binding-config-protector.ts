import { createCipheriv, randomBytes } from 'crypto';

import type {
  SourceBindingConfig,
  SourceBindingConfigProtectorPort,
  SourceBindingConfigValue,
} from '../../ports/source-binding-config-protector.port';

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
    if (key.length !== 32) {
      throw new Error('Source credential encryption key must be 32 bytes');
    }
  }

  static withEphemeralDevelopmentKey(): AesGcmSourceBindingConfigProtector {
    return new AesGcmSourceBindingConfigProtector(randomBytes(32), 'local-ephemeral');
  }

  async protect(config: SourceBindingConfig): Promise<SourceBindingConfig> {
    return this.protectObject(config);
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

  private encrypt(value: SourceBindingConfigValue): EncryptedConfigValue {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const plaintext = JSON.stringify(value);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    return {
      encrypted: true,
      algorithm: 'aes-256-gcm',
      keyId: this.keyId,
      iv: iv.toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
      authTag: cipher.getAuthTag().toString('base64url'),
    };
  }
}

const isConfigObject = (value: SourceBindingConfigValue): value is SourceBindingConfig =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
