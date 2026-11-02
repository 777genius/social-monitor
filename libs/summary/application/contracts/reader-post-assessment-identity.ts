import type { JsonObject, TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

export type ReaderPostAssessmentSource = {
  readonly tenantId: TenantId; readonly workspaceId: WorkspaceId;
  readonly interestId: string; readonly sourceItemId: string;
  readonly providerKey: string; readonly canonicalUrl: string;
  readonly title: string; readonly body: string; readonly interest: string;
  readonly contentHash: string;
  readonly sourceMetadata: JsonObject; readonly providerMetadata: JsonObject;
};

export type ReaderPostAssessmentIdentity = {
  readonly interestId: string; readonly sourceItemId: string;
  readonly sourceRevisionKey: string; readonly sourceSnapshotSha256: string;
  readonly interestSha256: string; readonly rubricVersion: string;
  readonly rubricSha256: string; readonly inputBuilderVersion: string;
  readonly modelConfigVersion: string; readonly requestSha256: string;
  matchesInputSha256(value: string): boolean;
};

/** Pure preparation from the catalog's current transaction snapshot; no scoring or database access. */
export interface ReaderPostAssessmentIdentityBuilder {
  readonly maxSourceBytes: number;
  prepare(source: ReaderPostAssessmentSource): ReaderPostAssessmentIdentity | undefined;
}
