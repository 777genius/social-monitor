import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

export type ReaderSummaryScope =
  | { readonly type: "workspace" }
  | { readonly type: "interest"; readonly interestId: string };

export type ReaderSummaryScopeIdentity = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
};

export const workspaceReaderSummaryScope = (): ReaderSummaryScope => ({
  type: "workspace",
});

export const interestReaderSummaryScope = (
  interestId: string,
): ReaderSummaryScope => {
  const normalizedInterestId = interestId.trim();
  if (normalizedInterestId.length === 0) {
    throw new Error("Reader summary interest scope interest id must be non-empty");
  }

  return { type: "interest", interestId: normalizedInterestId };
};

export const assertReaderSummaryScope = (scope: ReaderSummaryScope): void => {
  if (scope.type === "workspace") {
    return;
  }

  if (scope.interestId.trim().length === 0) {
    throw new Error("Reader summary interest scope interest id must be non-empty");
  }
};

export const readerSummaryScopeKey = (scope: ReaderSummaryScope): string =>
  scope.type === "workspace" ? "workspace" : `interest:${scope.interestId}`;

export const sameReaderSummaryScope = (
  left: ReaderSummaryScope,
  right: ReaderSummaryScope,
): boolean => readerSummaryScopeKey(left) === readerSummaryScopeKey(right);
