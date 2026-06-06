import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type DeliveryAttemptState =
  | 'queued'
  | 'assembling'
  | 'suppressed'
  | 'sending'
  | 'delivered'
  | 'failed_retryable'
  | 'failed_terminal'
  | 'dead_lettered'
  | 'cancelled';

export type DeliveryChannel = 'in_app' | 'email' | 'webhook';

export type DeliveryAttemptProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly idempotencyKey: string;
  readonly channel: DeliveryChannel;
  readonly recipientKey: string;
  readonly resourceType: 'summary' | 'digest' | 'scan' | 'feed';
  readonly resourceId: string;
  readonly state: DeliveryAttemptState;
  readonly queuedAt: Date;
  readonly assemblingAt?: Date;
  readonly suppressedAt?: Date;
  readonly sendingAt?: Date;
  readonly deliveredAt?: Date;
  readonly failedAt?: Date;
  readonly deadLetteredAt?: Date;
  readonly cancelledAt?: Date;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly failureReason?: string;
  readonly suppressionReason?: string;
};

export class DeliveryAttempt {
  private constructor(private readonly props: DeliveryAttemptProps) {}

  static queue(props: Omit<DeliveryAttemptProps, 'state' | 'retryCount'>): DeliveryAttempt {
    if (props.idempotencyKey.trim().length === 0) {
      throw new Error('Delivery idempotency key must be non-empty');
    }

    if (props.recipientKey.trim().length === 0) {
      throw new Error('Delivery recipient key must be non-empty');
    }

    if (props.resourceId.trim().length === 0) {
      throw new Error('Delivery resource id must be non-empty');
    }

    if (!Number.isInteger(props.maxRetries) || props.maxRetries < 0) {
      throw new Error('Delivery max retries must be a non-negative integer');
    }

    return new DeliveryAttempt({
      ...props,
      state: 'queued',
      retryCount: 0,
    });
  }

  markAssembling(params: { readonly assemblingAt: Date }): DeliveryAttempt {
    this.assertState(['queued'], 'Delivery attempt can only assemble from queued state');

    return new DeliveryAttempt({
      ...this.props,
      state: 'assembling',
      assemblingAt: params.assemblingAt,
    });
  }

  markSending(params: { readonly sendingAt: Date }): DeliveryAttempt {
    this.assertState(['queued', 'assembling', 'failed_retryable'], 'Delivery attempt can only send from an active state');

    return new DeliveryAttempt({
      ...this.props,
      state: 'sending',
      sendingAt: params.sendingAt,
    });
  }

  markDelivered(params: { readonly deliveredAt: Date }): DeliveryAttempt {
    this.assertState(['sending'], 'Delivery attempt can only be delivered from sending state');

    return new DeliveryAttempt({
      ...this.props,
      state: 'delivered',
      deliveredAt: params.deliveredAt,
    });
  }

  suppress(params: { readonly suppressedAt: Date; readonly suppressionReason: string }): DeliveryAttempt {
    this.assertState(['queued', 'assembling'], 'Delivery attempt can only be suppressed before sending');

    if (params.suppressionReason.trim().length === 0) {
      throw new Error('Suppressed delivery attempt must include a reason');
    }

    return new DeliveryAttempt({
      ...this.props,
      state: 'suppressed',
      suppressedAt: params.suppressedAt,
      suppressionReason: params.suppressionReason,
    });
  }

  fail(params: { readonly failedAt: Date; readonly failureReason: string; readonly retryable?: boolean }): DeliveryAttempt {
    this.assertState(['sending'], 'Delivery attempt can only fail from sending state');

    if (params.failureReason.trim().length === 0) {
      throw new Error('Failed delivery attempt must include a reason');
    }

    const retryCount = this.props.retryCount + 1;
    const retryable = (params.retryable ?? true) && retryCount <= this.props.maxRetries;

    return new DeliveryAttempt({
      ...this.props,
      state: retryable ? 'failed_retryable' : 'failed_terminal',
      failedAt: params.failedAt,
      retryCount,
      failureReason: params.failureReason,
    });
  }

  deadLetter(params: { readonly deadLetteredAt: Date; readonly failureReason: string }): DeliveryAttempt {
    this.assertState(['failed_terminal'], 'Delivery attempt can only be dead-lettered from terminal failure');

    return new DeliveryAttempt({
      ...this.props,
      state: 'dead_lettered',
      deadLetteredAt: params.deadLetteredAt,
      failureReason: params.failureReason,
    });
  }

  cancel(params: { readonly cancelledAt: Date; readonly failureReason: string }): DeliveryAttempt {
    this.assertState(['queued', 'assembling', 'failed_retryable'], 'Delivery attempt can only be cancelled before final state');

    return new DeliveryAttempt({
      ...this.props,
      state: 'cancelled',
      cancelledAt: params.cancelledAt,
      failureReason: params.failureReason,
    });
  }

  toSnapshot(): DeliveryAttemptProps {
    return { ...this.props };
  }

  private assertState(allowed: readonly DeliveryAttemptState[], message: string): void {
    if (!allowed.includes(this.props.state)) {
      throw new Error(message);
    }
  }
}
