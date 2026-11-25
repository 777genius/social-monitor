/** The complete enabled set at one read point; callers reject an empty or oversized set. */
export interface ReaderValueWorkspaceInterests {
  listEnabled(scope: { readonly tenantId: string; readonly workspaceId: string },
    limit: number): Promise<readonly { readonly interestId: string;
      readonly query: string }[]>;
}
