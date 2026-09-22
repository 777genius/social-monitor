export type ReaderValueSummaryPreparationConfig = {
  readonly schemaVersion: "reader_summary_preparation_config.v1";
  readonly interestId: string; readonly interestSha256: string;
  readonly rubricVersion: string; readonly rubricSha256: string;
  readonly inputBuilderVersion: string; readonly modelConfigVersion: string;
};
export type ReaderValueSummaryPreparationManifest = {
  readonly schemaVersion: "reader_summary_preparation_manifest.v1";
  readonly cutoffAt: string; readonly interestSha256: string;
  readonly rubricSha256: string; readonly inputBuilderVersion: string;
  readonly modelConfigVersion: string;
  readonly candidates: readonly {
    readonly candidateId: string; readonly sourceItemId: string;
    readonly sourceBindingId: string; readonly providerKey: string;
    readonly sourceRevisionKey: string; readonly sourceSnapshotSha256: string;
    readonly assessmentId: string; readonly inputSha256: string;
    readonly publishedAt: string; readonly observedAt: string;
    readonly sourceKind: string;
    readonly canonicalIdentity: string; readonly storyId?: string;
  }[];
};

export type PrepareReaderValueSummaryCommand = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId: string;
  readonly jobId: string;
  readonly periodStartedAt: string;
  readonly periodEndedAt: string;
  readonly cutoffAt: string;
};

export type PrepareReaderValueSummaryResult =
  | { readonly ok: true; readonly config: ReaderValueSummaryPreparationConfig;
      readonly manifest: ReaderValueSummaryPreparationManifest;
      readonly manifestSha256: string }
  | { readonly ok: false; readonly code: "assessment_snapshot_unavailable" |
      "assessment_inventory_over_budget" | "config_unavailable" };

export interface ReaderValueSummaryPreparation {
  configuration(command: PrepareReaderValueSummaryCommand): Promise<
    | { readonly ok: true; readonly config: ReaderValueSummaryPreparationConfig }
    | { readonly ok: false; readonly code: "config_unavailable" }>;
  prepare(command: PrepareReaderValueSummaryCommand,
    expectedConfig: ReaderValueSummaryPreparationConfig): Promise<PrepareReaderValueSummaryResult>;
}
