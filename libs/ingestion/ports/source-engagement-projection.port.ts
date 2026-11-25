import type {
  JsonObject,
  TenantId,
  WorkspaceId,
} from "@social-monitor/shared-kernel";

import type { SourceEngagementMetrics } from "../domain";

export type SourceEngagementSample = {
  readonly externalId: string;
  readonly sourceItemId?: string;
  readonly publishedAt: Date;
  readonly metrics: SourceEngagementMetrics;
  readonly metricsFingerprint: string;
  readonly providerMetadataPatch: JsonObject;
  readonly refreshReadModels: boolean;
};

export type ProjectSourceEngagementCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly scanJobId: string;
  readonly providerKey: string;
  readonly observedAt: Date;
  readonly samples: readonly SourceEngagementSample[];
};

export type ProjectSourceEngagementResult = {
  readonly currentSnapshotsUpdated: number;
  readonly observationsAppended: number;
  readonly metricChanges: number;
  readonly regressionsObserved: number;
  readonly retentionObservationsPurged?: number;
  readonly retentionRollupsPurged?: number;
  readonly retentionPurgeDeferred?: boolean;
};

export interface SourceEngagementProjectionPort {
  project(
    command: ProjectSourceEngagementCommand,
  ): Promise<ProjectSourceEngagementResult>;
}

export const noopSourceEngagementProjection: SourceEngagementProjectionPort = {
  async project() {
    return {
      currentSnapshotsUpdated: 0,
      observationsAppended: 0,
      metricChanges: 0,
      regressionsObserved: 0,
    };
  },
};
