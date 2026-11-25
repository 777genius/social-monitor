import type { DigestScheduleView } from '../shared/digest-schedule-presenter';

export type ListDigestSchedulesResult = {
  readonly schedules: readonly DigestScheduleView[];
  readonly nextCursor?: string;
};
