import type { SourceBindingConfig } from './source-binding-config-protector.port';

export type SourceCredentialSecret = SourceBindingConfig;

export interface SourceCredentialVaultPort {
  put(params: {
    readonly secretKeyId: string;
    readonly secret: SourceCredentialSecret;
  }): Promise<void>;
  get(params: {
    readonly secretKeyId: string;
  }): Promise<SourceCredentialSecret | null>;
  delete(params: {
    readonly secretKeyId: string;
  }): Promise<void>;
}
