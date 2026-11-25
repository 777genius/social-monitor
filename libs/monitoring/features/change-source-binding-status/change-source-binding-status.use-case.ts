import {
  type Clock, type IdGenerator, type DomainError, type Result,
} from '@social-monitor/shared-kernel';

import type { SourceBindingStatusChangeCommitPort } from '../../application/contracts/source-binding-status-change-commit';
import type { MonitoringCapacityLimits } from '../shared/monitoring-capacity-limits';
import type { ChangeSourceBindingStatusCommand } from './change-source-binding-status.command';
import type { ChangeSourceBindingStatusResult } from './change-source-binding-status.result';

export class ChangeSourceBindingStatusUseCase {
  constructor(
    private readonly commit: SourceBindingStatusChangeCommitPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly capacityLimits: MonitoringCapacityLimits = {},
  ) {}

  execute(command: ChangeSourceBindingStatusCommand):
    Promise<Result<ChangeSourceBindingStatusResult, DomainError | Error>> {
    return this.commit.change({
      command,
      receiptId: this.ids.generate(),
      eventId: this.ids.generate(),
      occurredAt: this.clock.now(),
      maxEnabledSourcesPerInterest: this.capacityLimits.maxEnabledSourcesPerInterest,
    });
  }
}
