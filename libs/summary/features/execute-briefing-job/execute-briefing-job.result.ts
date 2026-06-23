import type { BriefingJobStatus } from '../../domain';

export type ExecuteBriefingJobResult = {
  readonly briefingJobId: string;
  readonly status: BriefingJobStatus;
  readonly briefingId?: string;
};
