import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type VerifyWebhookSignatureCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly webhookEndpointId: string;
  readonly deliveryId: string;
  readonly timestamp: string;
  readonly rawBody: string;
  readonly signatureHeader: string;
  readonly keyId: string;
  readonly toleranceSeconds: number;
};
