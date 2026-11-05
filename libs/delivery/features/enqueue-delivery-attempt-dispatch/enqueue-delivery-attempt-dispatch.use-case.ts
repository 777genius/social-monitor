import { type Clock, type IdGenerator, DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import {
  deliveryWorkflowTiming,
  type DeliveryAttemptDispatchStore,
  type DeliveryWorkflowTiming,
} from '../../application/contracts/delivery-attempt-workflow';
import type { EnqueueDeliveryAttemptDispatchCommand } from './enqueue-delivery-attempt-dispatch.command';
import type { EnqueueDeliveryAttemptDispatchResult } from './enqueue-delivery-attempt-dispatch.result';

export class EnqueueDeliveryAttemptDispatchUseCase {
  constructor(
    private readonly dispatch: DeliveryAttemptDispatchStore,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly timing: DeliveryWorkflowTiming = deliveryWorkflowTiming,
  ) {}

  async execute(command: EnqueueDeliveryAttemptDispatchCommand): Promise<Result<EnqueueDeliveryAttemptDispatchResult, DomainError | Error>> {
    if (command.deliveryAttemptId.trim().length === 0 || command.correlationId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Delivery attempt id and correlation id must be non-empty'));
    }
    const now = this.clock.now();
    const result = await this.dispatch.dispatch({
      ...command, commandId: this.ids.generate(), now,
      recoverBefore: new Date(now.getTime() - this.timing.dispatchRecoveryMs),
    });
    if (result === null) {
      return err(new DomainError('resource.not_found', 'Delivery attempt not found', { deliveryAttemptId: command.deliveryAttemptId }));
    }
    const snapshot = result.attempt.toSnapshot();
    return ok({
      deliveryAttemptId: snapshot.id,
      state: snapshot.state,
      enqueued: result.enqueued,
      ...(result.enqueued ? {} : {
        reason: ['assembling', 'sending'].includes(snapshot.state) ? 'already_in_flight' as const : 'not_dispatchable' as const,
      }),
    });
  }
}
