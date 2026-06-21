import type { SourceCredentialSecret, SourceCredentialVaultPort } from '../../ports';

export class InMemorySourceCredentialSecretVault implements SourceCredentialVaultPort {
  private readonly secretsByKeyId = new Map<string, SourceCredentialSecret>();

  async put(params: {
    readonly secretKeyId: string;
    readonly secret: SourceCredentialSecret;
  }): Promise<void> {
    this.secretsByKeyId.set(params.secretKeyId, params.secret);
  }

  async get(params: { readonly secretKeyId: string }): Promise<SourceCredentialSecret | null> {
    return this.secretsByKeyId.get(params.secretKeyId) ?? null;
  }

  async delete(params: { readonly secretKeyId: string }): Promise<void> {
    this.secretsByKeyId.delete(params.secretKeyId);
  }
}
