import type { BriefingJobStatus } from '../../domain';

export type RequestBriefingResult = {
  readonly briefingJobId: string;
  readonly status: BriefingJobStatus;
  readonly created: boolean;
};
