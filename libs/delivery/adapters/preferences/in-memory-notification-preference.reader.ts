import type {
  DeliveryPreferenceDecision,
  DeliveryPreferenceQuery,
  NotificationPreferenceReaderPort,
} from '../../ports';

export class InMemoryNotificationPreferenceReader implements NotificationPreferenceReaderPort {
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
