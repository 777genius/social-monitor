import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { DigestScheduleRepositoryPort } from '../../ports';
import { presentDigestSchedule } from '../shared/digest-schedule-presenter';
import type { GetDigestScheduleQuery } from './get-digest-schedule.query';
import type { GetDigestScheduleResult } from './get-digest-schedule.result';

type GetDigestScheduleFailure = DomainError;

export class GetDigestScheduleUseCase {
  constructor(private readonly schedules: DigestScheduleRepositoryPort) {}

  async execute(query: GetDigestScheduleQuery): Promise<Result<GetDigestScheduleResult, GetDigestScheduleFailure>> {
    if (query.digestScheduleId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Digest schedule id must be non-empty'));
    }

    const schedule = await this.schedules.findById(query);

    if (schedule === null) {
      return err(new DomainError('resource.not_found', 'Digest schedule not found', {
        digestScheduleId: query.digestScheduleId,
      }));
    }

    return ok(presentDigestSchedule(schedule));
  }
}
