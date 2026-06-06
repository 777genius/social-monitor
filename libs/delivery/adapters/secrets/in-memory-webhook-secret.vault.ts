import type { WebhookSecretVaultPort } from '../../ports';

export class InMemoryWebhookSecretVault implements WebhookSecretVaultPort {
  private readonly secretsByKeyId = new Map<string, string>();

  async put(params: { readonly secretKeyId: string; readonly secret: string }): Promise<void> {
    this.secretsByKeyId.set(params.secretKeyId, params.secret);
  }

  async get(params: { readonly secretKeyId: string }): Promise<string | null> {
    return this.secretsByKeyId.get(params.secretKeyId) ?? null;
  }
}
