import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SummaryEvidenceSelection } from './summary-evidence-selector.port';

export type SummaryMemoryStatus = 'disabled' | 'available' | 'empty' | 'unavailable';

export type SummaryMemoryDiagnostics = Readonly<Record<string, unknown>>;

export type SummaryMemoryContext = {
  readonly status: SummaryMemoryStatus;
  readonly renderedText?: string | undefined;
  readonly diagnostics: SummaryMemoryDiagnostics;
  readonly retrievedAt: Date;
};

export type BuildSummaryMemoryContextQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly userId?: string | undefined;
  readonly subscriptionId?: string | undefined;
  readonly evidence: SummaryEvidenceSelection;
  readonly requestedAt: Date;
};

export type RecordSummaryFeedbackMemoryCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly summaryId: string;
  readonly feedbackId: string;
  readonly idempotencyKey: string;
  readonly submittedBy: string;
  readonly rating: number;
  readonly category: string;
  readonly comment?: string | undefined;
  readonly citationId?: string | undefined;
  readonly feedItemId?: string | undefined;
  readonly sourceItemId?: string | undefined;
  readonly providerKey?: string | undefined;
  readonly createdAt: Date;
};

export type SummaryMemoryWriteResult = {
  readonly status: 'disabled' | 'written' | 'skipped' | 'unavailable';
  readonly diagnostics?: SummaryMemoryDiagnostics | undefined;
};

export interface SummaryMemoryPort {
  buildContext(query: BuildSummaryMemoryContextQuery): Promise<SummaryMemoryContext>;
  recordSummaryFeedback(command: RecordSummaryFeedbackMemoryCommand): Promise<SummaryMemoryWriteResult>;
}

export const NOOP_SUMMARY_MEMORY: SummaryMemoryPort = {
  async buildContext(query) {
    return {
      status: 'disabled',
      diagnostics: {
        mode: 'disabled',
        topicId: query.topicId,
      },
      retrievedAt: query.requestedAt,
    };
  },
  async recordSummaryFeedback() {
    return {
      status: 'disabled',
      diagnostics: { mode: 'disabled' },
    };
  },
};
