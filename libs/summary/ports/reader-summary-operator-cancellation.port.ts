export type ReaderSummaryOperatorCancellationStatus =
  | "cancelled"
  | "already_published"
  | "already_terminal"
  | "not_found";

export interface ReaderSummaryOperatorCancellationPort {
  preview(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly jobIds: readonly string[];
  }): Promise<readonly { readonly jobId: string; readonly status: string }[]>;
  cancel(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly jobIds: readonly string[];
  }): Promise<readonly { readonly jobId: string;
    readonly status: ReaderSummaryOperatorCancellationStatus }[]>;
}
