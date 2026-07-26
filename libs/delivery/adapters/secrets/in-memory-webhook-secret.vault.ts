import type { WebhookSecretVaultPort } from '../../ports';

export class InMemoryWebhookSecretVault implements WebhookSecretVaultPort {
  private readonly secretsByKeyId = new Map<string, {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly secret: string;
  }>();

  async put(params: Parameters<WebhookSecretVaultPort['put']>[0]): Promise<void> {
    const existing = this.secretsByKeyId.get(params.secretKeyId);

    if (
      existing !== undefined &&
      (existing.tenantId !== params.tenantId || existing.workspaceId !== params.workspaceId)
    ) {
      throw new Error('Webhook secret key is already owned by another tenant workspace');
    }

    this.secretsByKeyId.set(params.secretKeyId, {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      secret: params.secret,
    });
  }

  async get(params: Parameters<WebhookSecretVaultPort['get']>[0]): Promise<string | null> {
    const record = this.secretsByKeyId.get(params.secretKeyId);

    return record?.tenantId === params.tenantId && record.workspaceId === params.workspaceId
      ? record.secret
      : null;
  }
}
