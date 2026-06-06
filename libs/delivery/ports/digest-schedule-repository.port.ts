import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { DigestSchedule } from '../domain';

export type FindDueDigestSchedulesQuery = {
  readonly tenantId?: TenantId;
  readonly workspaceId?: WorkspaceId;
  readonly now: Date;
  readonly limit: number;
};

export interface DigestScheduleRepositoryPort {
  save(schedule: DigestSchedule): Promise<void>;
  findById(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly digestScheduleId: string;
  }): Promise<DigestSchedule | null>;
  findDue(query: FindDueDigestSchedulesQuery): Promise<readonly DigestSchedule[]>;
}
