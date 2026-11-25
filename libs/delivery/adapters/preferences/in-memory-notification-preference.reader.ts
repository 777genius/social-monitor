import type {
  DeliveryPreferenceDecision,
  DeliveryPreferenceQuery,
  GetRecipientChannelNotificationPreferenceQuery,
  NotificationPreferenceManagementPort,
  NotificationPreferenceReaderPort,
  RecipientChannelNotificationPreference,
  SetRecipientChannelNotificationPreferenceCommand,
} from '../../ports';

export class InMemoryNotificationPreferenceReader
  implements NotificationPreferenceReaderPort, NotificationPreferenceManagementPort {
  private readonly suppressedByRecipientChannel = new Map<string, string>();

  suppressRecipientChannel(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly recipientKey: string;
    readonly channel: string;
    readonly reason: string;
  }): void {
    this.suppressedByRecipientChannel.set(
      buildRecipientChannelKey(params),
      params.reason,
    );
  }

  allowRecipientChannel(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly recipientKey: string;
    readonly channel: string;
  }): void {
    this.suppressedByRecipientChannel.delete(buildRecipientChannelKey(params));
  }

  async setRecipientChannelPreference(
    command: SetRecipientChannelNotificationPreferenceCommand,
  ): Promise<RecipientChannelNotificationPreference> {
    if (command.allowed) {
      this.allowRecipientChannel(command);

      return {
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        recipientKey: command.recipientKey,
        channel: command.channel,
        allowed: true,
      };
    }

    const reason = command.reason ?? 'Delivery suppressed by notification preference';
    this.suppressRecipientChannel({
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
    const reason = this.suppressedByRecipientChannel.get(buildRecipientChannelKey(query));

    if (reason === undefined) {
      return null;
    }

    return {
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      recipientKey: query.recipientKey,
      channel: query.channel,
      allowed: false,
      reason,
    };
  }

  async getDeliveryPreference(query: DeliveryPreferenceQuery): Promise<DeliveryPreferenceDecision> {
    const reason = this.suppressedByRecipientChannel.get(buildRecipientChannelKey(query));

    if (reason !== undefined) {
      return {
        allowed: false,
        reason,
      };
    }

    return {
      allowed: true,
    };
  }
}

const buildRecipientChannelKey = (params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly recipientKey: string;
  readonly channel: string;
}): string => [params.tenantId, params.workspaceId, params.recipientKey, params.channel].join(':');
