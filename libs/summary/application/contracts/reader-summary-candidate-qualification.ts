import type { SummaryEvidenceItem } from '../../domain';
import type { ReaderSummaryEvidenceSelectorPort } from '../../ports';

export type ReaderSummaryCandidateQualificationAudit = Readonly<{
  schemaVersion: 'reader_summary.jev_capture_qualification.v1';
  tenantId: string;
  workspaceId: string;
  cutoffAt: string;
  assessmentCutoffAt: string;
  candidates: readonly Readonly<{
    feedItemId: string;
    admitted: boolean;
    assessmentId?: string;
    inputSha256?: string;
    sourceSnapshotSha256?: string;
    interestSha256?: string;
    assessedAt?: string;
  }>[];
}>;

/** Capture-time qualification only. Replay uses its existing frozen source authority. */
export interface ReaderSummaryCandidateQualification {
  qualify(params: Parameters<ReaderSummaryEvidenceSelectorPort['select']>[0],
    items: readonly SummaryEvidenceItem[]): Promise<Readonly<{
      items: readonly SummaryEvidenceItem[];
      audit: ReaderSummaryCandidateQualificationAudit;
    }>>;
}
