import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ExportSummaryFeedbackSamplesSourceKind = 'internal_dogfood' | 'private_beta';

export type ExportSummaryFeedbackSamplesCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sampleWindow: {
    readonly startedAt: Date;
    readonly endedAt: Date;
  };
  readonly limit: number;
  readonly source: {
    readonly kind: ExportSummaryFeedbackSamplesSourceKind;
    readonly environmentId: string;
    readonly operator: string;
    readonly collectionMethod: string;
    readonly redactedBy: string;
    readonly approvedBy: string;
    readonly export: {
      readonly sourceSystem: string;
      readonly exportId: string;
      readonly exportedAt: Date;
      readonly reviewQueue: string;
      readonly redactionReviewId: string;
      readonly approvalReference: string;
    };
  };
};
