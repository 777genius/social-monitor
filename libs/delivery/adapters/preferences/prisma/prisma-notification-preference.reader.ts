import type {
  DeliveryPreferenceDecision,
  DeliveryPreferenceQuery,
  NotificationPreferenceReaderPort,
} from '../../../ports';
import type { PrismaDeliveryClient } from '../../persistence/prisma/prisma-delivery-client';

export class PrismaNotificationPreferenceReader implements NotificationPreferenceReaderPort {
  constructor(private readonly prisma: PrismaDeliveryClient) {}

  async suppressRecipientChannel(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly recipientKey: string;
    readonly channel: string;
    readonly reason: string;
  }): Promise<void> {
    if (params.reason.trim().length === 0) {
      throw new Error('Notification suppression reason must be non-empty');
    }

    await this.prisma.notificationPreference.upsert({
      where: {
        tenantId_workspaceId_recipientKey_channel: preferenceKey(params),
      },
      update: {
        allowed: false,
        reason: params.reason,
      },
      create: {
        ...preferenceKey(params),
        allowed: false,
        reason: params.reason,
      },
    });
  }

  async allowRecipientChannel(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly recipientKey: string;
    readonly channel: string;
  }): Promise<void> {
    await this.prisma.notificationPreference.upsert({
      where: {
        tenantId_workspaceId_recipientKey_channel: preferenceKey(params),
      },
      update: {
        allowed: true,
        reason: null,
      },
      create: {
        ...preferenceKey(params),
        allowed: true,
        reason: null,
      },
    });
  }

  async getDeliveryPreference(query: DeliveryPreferenceQuery): Promise<DeliveryPreferenceDecision> {
    const record = await this.prisma.notificationPreference.findUnique({
      where: {
        tenantId_workspaceId_recipientKey_channel: preferenceKey(query),
      },
    });

    if (record === null || record.allowed) {
      return {
        allowed: true,
      };
    }

    return {
      allowed: false,
      reason: record.reason ?? 'Delivery suppressed by notification preference',
    };
  }
}

const preferenceKey = (params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly recipientKey: string;
  readonly channel: string;
}): {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly recipientKey: string;
  readonly channel: string;
} => ({
  tenantId: params.tenantId,
  workspaceId: params.workspaceId,
  recipientKey: params.recipientKey,
  channel: params.channel,
});
