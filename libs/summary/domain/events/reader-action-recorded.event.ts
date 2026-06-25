import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderActionKind } from "../entities/reader-action";

export type ReaderActionRecordedEvent = {
  readonly type: "reader_action.recorded";
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly readerSummaryId: string;
  readonly actionKind: ReaderActionKind;
  readonly recordedAt: Date;
  readonly citationIds: readonly string[];
};
