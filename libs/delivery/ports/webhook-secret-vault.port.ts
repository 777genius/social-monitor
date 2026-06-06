export interface WebhookSecretVaultPort {
  put(params: { readonly secretKeyId: string; readonly secret: string }): Promise<void>;
  get(params: { readonly secretKeyId: string }): Promise<string | null>;
}
