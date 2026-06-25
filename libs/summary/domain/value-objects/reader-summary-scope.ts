import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

export type ReaderSummaryScope =
  | { readonly type: "workspace" }
  | { readonly type: "topic"; readonly topicId: string };

export type ReaderSummaryScopeIdentity = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
};

export const workspaceReaderSummaryScope = (): ReaderSummaryScope => ({
  type: "workspace",
});

export const topicReaderSummaryScope = (
  topicId: string,
): ReaderSummaryScope => {
  const normalizedTopicId = topicId.trim();
  if (normalizedTopicId.length === 0) {
    throw new Error("Reader summary topic scope topic id must be non-empty");
  }

  return { type: "topic", topicId: normalizedTopicId };
};

export const assertReaderSummaryScope = (scope: ReaderSummaryScope): void => {
  if (scope.type === "workspace") {
    return;
  }

  if (scope.topicId.trim().length === 0) {
    throw new Error("Reader summary topic scope topic id must be non-empty");
  }
};

export const readerSummaryScopeKey = (scope: ReaderSummaryScope): string =>
  scope.type === "workspace" ? "workspace" : `topic:${scope.topicId}`;

export const sameReaderSummaryScope = (
  left: ReaderSummaryScope,
  right: ReaderSummaryScope,
): boolean => readerSummaryScopeKey(left) === readerSummaryScopeKey(right);
