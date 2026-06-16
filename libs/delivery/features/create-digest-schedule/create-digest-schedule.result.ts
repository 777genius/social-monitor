import type { DigestScheduleView } from '../shared/digest-schedule-presenter';

export type CreateDigestScheduleResult = {
  readonly schedule: DigestScheduleView;
  readonly created: true;
};
