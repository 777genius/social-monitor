import type { DigestSchedule, DigestScheduleProps } from '../../domain';

export type DigestScheduleView = Omit<DigestScheduleProps, 'nextRunAt' | 'createdAt'> & {
  readonly nextRunAt: string;
  readonly createdAt: string;
};

export const presentDigestSchedule = (schedule: DigestSchedule): DigestScheduleView => {
  const snapshot = schedule.toSnapshot();

  return {
    ...snapshot,
    nextRunAt: snapshot.nextRunAt.toISOString(),
    createdAt: snapshot.createdAt.toISOString(),
  };
};
