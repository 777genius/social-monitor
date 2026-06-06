import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type WebhookEndpointStatus = 'enabled' | 'disabled' | 'quarantined';

export type WebhookEndpointProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly url: string;
  readonly eventTypes: readonly string[];
  readonly status: WebhookEndpointStatus;
  readonly secretKeyId: string;
  readonly secretPreview: string;
  readonly createdAt: Date;
  readonly quarantinedAt?: Date;
  readonly quarantineReason?: string;
};

export class WebhookEndpoint {
  private constructor(private readonly props: WebhookEndpointProps) {}

  static create(props: WebhookEndpointProps): WebhookEndpoint {
    if (props.id.trim().length === 0) {
      throw new Error('Webhook endpoint id must be non-empty');
    }

    if (!isHttpsUrl(props.url)) {
      throw new Error('Webhook endpoint URL must be HTTPS');
    }

    if (props.eventTypes.length === 0 || props.eventTypes.some((eventType) => eventType.trim().length === 0)) {
      throw new Error('Webhook endpoint event types must be non-empty');
    }

    if (props.secretKeyId.trim().length === 0 || props.secretPreview.trim().length === 0) {
      throw new Error('Webhook endpoint secret metadata must be non-empty');
    }

    return new WebhookEndpoint({
      ...props,
      eventTypes: [...new Set(props.eventTypes)].sort((left, right) => left.localeCompare(right)),
    });
  }

  toSnapshot(): WebhookEndpointProps {
    return { ...this.props };
  }

  quarantine(params: { readonly quarantinedAt: Date; readonly reason: string }): WebhookEndpoint {
    if (params.reason.trim().length === 0) {
      throw new Error('Webhook endpoint quarantine reason must be non-empty');
    }

    return new WebhookEndpoint({
      ...this.props,
      status: 'quarantined',
      quarantinedAt: params.quarantinedAt,
      quarantineReason: params.reason,
    });
  }
}

const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};
