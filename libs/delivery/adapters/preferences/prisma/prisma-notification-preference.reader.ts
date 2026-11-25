import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type {
  DeliveryPreferenceDecision,
  DeliveryPreferenceQuery,
  GetRecipientChannelNotificationPreferenceQuery,
  NotificationPreferenceManagementPort,
  NotificationPreferenceReaderPort,
  RecipientChannelNotificationPreference,
  SetRecipientChannelNotificationPreferenceCommand,
} from '../../../ports';
import type { PrismaNotificationPreferenceRecord } from '../../persistence/prisma/prisma-delivery-records';
import type { PrismaDeliveryClient } from '../../persistence/prisma/prisma-delivery-client';

export class PrismaNotificationPreferenceReader
  implements NotificationPreferenceReaderPort, NotificationPreferenceManagementPort {
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

    await withPrismaWriteRetry(() => this.prisma.notificationPreference.upsert({
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
    }));
  }

  async allowRecipientChannel(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly recipientKey: string;
    readonly channel: string;
  }): Promise<void> {
    await withPrismaWriteRetry(() => this.prisma.notificationPreference.upsert({
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
    }));
  }

  async setRecipientChannelPreference(
    command: SetRecipientChannelNotificationPreferenceCommand,
  ): Promise<RecipientChannelNotificationPreference> {
    if (command.allowed) {
      await this.allowRecipientChannel(command);

      return {
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        recipientKey: command.recipientKey,
        channel: command.channel,
        allowed: true,
      };
    }

    const reason = command.reason ?? 'Delivery suppressed by notification preference';
    await this.suppressRecipientChannel({
      ...command,
      reason,
    });

    return {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      recipientKey: command.recipientKey,
      channel: command.channel,
      allowed: false,
      reason,
    };
  }

  async getRecipientChannelPreference(
    query: GetRecipientChannelNotificationPreferenceQuery,
  ): Promise<RecipientChannelNotificationPreference | null> {
    const record = await this.prisma.notificationPreference.findUnique({
      where: {
        tenantId_workspaceId_recipientKey_channel: preferenceKey(query),
      },
    });

    return record === null ? null : notificationPreferenceFromPrisma(record);
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

const notificationPreferenceFromPrisma = (
  record: PrismaNotificationPreferenceRecord,
): RecipientChannelNotificationPreference => ({
  tenantId: tenantId(record.tenantId),
  workspaceId: workspaceId(record.workspaceId),
  recipientKey: record.recipientKey,
  channel: record.channel as RecipientChannelNotificationPreference['channel'],
  allowed: record.allowed,
  reason: record.reason ?? undefined,
});
