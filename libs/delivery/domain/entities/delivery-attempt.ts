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
    return this.rehydrate({
      ...props,
      state: 'queued',
      retryCount: 0,
    });
  }

  static rehydrate(props: DeliveryAttemptProps): DeliveryAttempt {
    this.assertValid(props);

    return new DeliveryAttempt({
      ...props,
      idempotencyKey: props.idempotencyKey.trim(),
      recipientKey: props.recipientKey.trim(),
      resourceId: props.resourceId.trim(),
      failureReason: props.failureReason?.trim(),
      suppressionReason: props.suppressionReason?.trim(),
    });
  }

  markAssembling(params: { readonly assemblingAt: Date }): DeliveryAttempt {
    this.assertState(['queued', 'failed_retryable'], 'Delivery attempt can only assemble from a dispatchable state');

    return DeliveryAttempt.rehydrate({
      ...this.props,
      state: 'assembling',
      assemblingAt: params.assemblingAt,
      failedAt: undefined,
      failureReason: undefined,
    });
  }

  markSending(params: { readonly sendingAt: Date }): DeliveryAttempt {
    this.assertState(['queued', 'assembling', 'failed_retryable'], 'Delivery attempt can only send from an active state');

    return DeliveryAttempt.rehydrate({
      ...this.props,
      state: 'sending',
      sendingAt: params.sendingAt,
      failedAt: undefined,
      failureReason: undefined,
    });
  }

  markDelivered(params: { readonly deliveredAt: Date }): DeliveryAttempt {
    this.assertState(['sending'], 'Delivery attempt can only be delivered from sending state');

    return DeliveryAttempt.rehydrate({
      ...this.props,
      state: 'delivered',
      deliveredAt: params.deliveredAt,
    });
  }

  suppress(params: { readonly suppressedAt: Date; readonly suppressionReason: string }): DeliveryAttempt {
    this.assertState(['queued', 'assembling', 'failed_retryable'], 'Delivery attempt can only be suppressed before sending');

    if (params.suppressionReason.trim().length === 0) {
      throw new Error('Suppressed delivery attempt must include a reason');
    }

    return DeliveryAttempt.rehydrate({
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

    return DeliveryAttempt.rehydrate({
      ...this.props,
      state: retryable ? 'failed_retryable' : 'failed_terminal',
      failedAt: params.failedAt,
      retryCount,
      failureReason: params.failureReason,
    });
  }

  deadLetter(params: { readonly deadLetteredAt: Date; readonly failureReason: string }): DeliveryAttempt {
    this.assertState(['failed_terminal'], 'Delivery attempt can only be dead-lettered from terminal failure');

    return DeliveryAttempt.rehydrate({
      ...this.props,
      state: 'dead_lettered',
      deadLetteredAt: params.deadLetteredAt,
      failureReason: params.failureReason,
    });
  }

  cancel(params: { readonly cancelledAt: Date; readonly failureReason: string }): DeliveryAttempt {
    this.assertState(['queued', 'assembling', 'failed_retryable'], 'Delivery attempt can only be cancelled before final state');

    return DeliveryAttempt.rehydrate({
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

  private static assertValid(props: DeliveryAttemptProps): void {
    if (props.id.trim().length === 0) {
      throw new Error('Delivery attempt id must be non-empty');
    }

    if (props.idempotencyKey.trim().length === 0) {
      throw new Error('Delivery idempotency key must be non-empty');
    }

    if (props.recipientKey.trim().length === 0) {
      throw new Error('Delivery recipient key must be non-empty');
    }

    if (props.resourceId.trim().length === 0) {
      throw new Error('Delivery resource id must be non-empty');
    }

    for (const [label, value] of [
      ['retry count', props.retryCount],
      ['max retries', props.maxRetries],
    ] as const) {
      if (!Number.isInteger(value) || value < 0) {
        throw new Error(`Delivery ${label} must be a non-negative integer`);
      }
    }

    if (props.retryCount > props.maxRetries + 1) {
      throw new Error('Delivery retry count must not exceed retry budget by more than terminal failure');
    }

    const stateTimestamps: Partial<Record<DeliveryAttemptState, Date | undefined>> = {
      assembling: props.assemblingAt,
      suppressed: props.suppressedAt,
      sending: props.sendingAt,
      delivered: props.deliveredAt,
      failed_retryable: props.failedAt,
      failed_terminal: props.failedAt,
      dead_lettered: props.deadLetteredAt,
      cancelled: props.cancelledAt,
    };
    const requiredTimestamp = stateTimestamps[props.state];

    if (props.state !== 'queued' && requiredTimestamp === undefined) {
      throw new Error(`Delivery attempt state ${props.state} must include its transition timestamp`);
    }

    if (
      (props.state === 'failed_retryable' || props.state === 'failed_terminal' || props.state === 'dead_lettered') &&
      (props.failureReason ?? '').trim().length === 0
    ) {
      throw new Error('Failed delivery attempt must include failure reason');
    }

    if (props.state === 'suppressed' && (props.suppressionReason ?? '').trim().length === 0) {
      throw new Error('Suppressed delivery attempt must include suppression reason');
    }

    if (props.state === 'cancelled' && (props.failureReason ?? '').trim().length === 0) {
      throw new Error('Cancelled delivery attempt must include cancellation reason');
    }
  }
}
