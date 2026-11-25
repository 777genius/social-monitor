import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { DigestScheduleRepositoryPort } from '../../ports';
import { presentDigestSchedule } from '../shared/digest-schedule-presenter';
import type { ListDigestSchedulesQuery } from './list-digest-schedules.query';
import type { ListDigestSchedulesResult } from './list-digest-schedules.result';

type ListDigestSchedulesFailure = DomainError;

export class ListDigestSchedulesUseCase {
  constructor(private readonly schedules: DigestScheduleRepositoryPort) {}

  async execute(
    query: ListDigestSchedulesQuery,
  ): Promise<Result<ListDigestSchedulesResult, ListDigestSchedulesFailure>> {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) {
      return err(new DomainError('validation.failed', 'Digest schedule list limit must be between 1 and 100'));
    }

    const result = await this.schedules.list(query);

    return ok({
      schedules: result.schedules.map(presentDigestSchedule),
      nextCursor: result.nextCursor,
    });
  }
}
