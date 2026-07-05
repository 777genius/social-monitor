import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { SourceItem } from "../domain";
import type { SourceQuery } from "./source-provider.port";

export type FeedProjectionSnapshots = {
  readonly interestQuerySnapshot: {
    readonly interestId: string;
    readonly query: string;
  };
  readonly sourceBindingSnapshot: {
    readonly sourceBindingId: string;
    readonly providerKey: string;
    readonly sourceQuery: Pick<SourceQuery, "mode" | "query">;
  };
  readonly workspaceScopeSnapshot: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
  };
};

export type ProjectFeedItemsCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly snapshots: FeedProjectionSnapshots;
  readonly sourceItems: readonly SourceItem[];
};

export type ProjectedFeedItemRef = {
  readonly sourceItemId: string;
  readonly sourceExternalId: string;
  readonly feedItemId: string;
};

export type ProjectFeedItemsResult = {
  readonly projected: number;
  readonly projectedItems: readonly ProjectedFeedItemRef[];
};

export interface FeedProjectionPort {
  project(command: ProjectFeedItemsCommand): Promise<ProjectFeedItemsResult>;
}
