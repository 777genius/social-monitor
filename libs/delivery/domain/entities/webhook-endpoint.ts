import { validateOutboundUrl, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

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
  readonly disabledAt?: Date;
  readonly quarantinedAt?: Date;
  readonly quarantineReason?: string;
};

export class WebhookEndpoint {
  private constructor(private readonly props: WebhookEndpointProps) {}

  static create(props: WebhookEndpointProps): WebhookEndpoint {
    return WebhookEndpoint.fromProps(props);
  }

  static rehydrate(props: WebhookEndpointProps): WebhookEndpoint {
    return WebhookEndpoint.fromProps(props);
  }

  private static fromProps(props: WebhookEndpointProps): WebhookEndpoint {
    if (props.id.trim().length === 0) {
      throw new Error('Webhook endpoint id must be non-empty');
    }

    const urlValidation = validateWebhookEndpointUrl(props.url);
    if (!urlValidation.ok) {
      throw new Error(urlValidation.reason);
    }

    if (props.eventTypes.length === 0 || props.eventTypes.some((eventType) => eventType.trim().length === 0)) {
      throw new Error('Webhook endpoint event types must be non-empty');
    }

    if (props.secretKeyId.trim().length === 0 || props.secretPreview.trim().length === 0) {
      throw new Error('Webhook endpoint secret metadata must be non-empty');
    }

    if (!webhookEndpointStatuses.includes(props.status)) {
      throw new Error(`Unknown webhook endpoint status: ${String(props.status)}`);
    }

    if (props.status === 'disabled' && props.disabledAt === undefined) {
      throw new Error('Disabled webhook endpoint must have disabledAt');
    }

    if (props.status === 'quarantined') {
      if (props.quarantinedAt === undefined) {
        throw new Error('Quarantined webhook endpoint must have quarantinedAt');
      }

      if (props.quarantineReason === undefined || props.quarantineReason.trim().length === 0) {
        throw new Error('Quarantined webhook endpoint must have quarantine reason');
      }
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

  disable(params: { readonly disabledAt: Date }): WebhookEndpoint {
    return new WebhookEndpoint({
      ...this.props,
      status: 'disabled',
      disabledAt: params.disabledAt,
    });
  }
}

const webhookEndpointStatuses = ['enabled', 'disabled', 'quarantined'] as const satisfies readonly WebhookEndpointStatus[];

const validateWebhookEndpointUrl = (value: string): { readonly ok: true } | { readonly ok: false; readonly reason: string } => {
  const result = validateOutboundUrl(value, {
    label: 'Webhook endpoint URL',
    allowedProtocols: ['https:'],
  });

  return result.ok ? { ok: true } : result;
};
