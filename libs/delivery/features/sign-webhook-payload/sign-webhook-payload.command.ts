import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { DeliveryAttemptProps } from '../../domain';

export type SignWebhookPayloadCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly webhookEndpointId: string;
  readonly deliveryId: string;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly resourceType: DeliveryAttemptProps['resourceType'];
  readonly resourceId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly resourceLinks: Readonly<Record<string, string>>;
  readonly summary: Readonly<Record<string, string | number | boolean | null>>;
};
