import type { Result } from '@social-monitor/shared-kernel';

export type RetainedCaptureBatch = {
  readonly tenantId: string; readonly workspaceId: string; readonly interestId: string;
  readonly periodStartedAt: string; readonly periodEndedAt: string;
  /** PostgreSQL SHA256 of row_to_json(source_items)::text; not a text-only revision. */
  readonly targets: readonly { readonly sourceItemId: string; readonly expectedRowSha256: string }[];
};
export type RetainedCaptureReceipt = {
  readonly materialized: readonly { readonly sourceItemId: string;
    readonly availableAt: string; readonly captureSha256: string }[];
  readonly skipped: readonly string[];
};
export interface RetainedSourceCaptureRepository {
  materialize(batch: RetainedCaptureBatch): Promise<Result<RetainedCaptureReceipt,
    'invalid_batch' | 'source_changed' | 'unsupported_capture'>>;
}
