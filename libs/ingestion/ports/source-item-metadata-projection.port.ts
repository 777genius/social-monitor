import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceItem } from '../domain';

export type ProjectSourceItemMetadataCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly sourceBindingId: string;
  readonly scanJobId: string;
  readonly providerKey: string;
  readonly sourceItems: readonly SourceItem[];
};

export type ProjectSourceItemMetadataResult = {
  readonly projected: number;
};

export interface SourceItemMetadataProjectionPort {
  project(command: ProjectSourceItemMetadataCommand): Promise<ProjectSourceItemMetadataResult>;
}

export const noopSourceItemMetadataProjection: SourceItemMetadataProjectionPort = {
  async project(): Promise<ProjectSourceItemMetadataResult> {
    return { projected: 0 };
  },
};
