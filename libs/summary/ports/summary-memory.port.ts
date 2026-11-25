import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SummaryEvidenceSelection } from './summary-evidence-selector.port';

export type SummaryMemoryStatus = 'disabled' | 'available' | 'empty' | 'unavailable';

export type SummaryMemoryDiagnostics = Readonly<Record<string, unknown>>;

export type SummaryMemorySourceRef = Readonly<Record<string, unknown>> & {
  readonly source_type?: string | undefined;
  readonly source_id?: string | undefined;
};

export type SummaryMemoryRetrieval = {
  readonly vectorStatus?: string | undefined;
  readonly graphStatus?: string | undefined;
  readonly ragStatus?: string | undefined;
  readonly retrievalSourcesUsed?: readonly string[] | undefined;
  readonly retrievalSourcesTotal?: number | undefined;
  readonly retrievalSourcesReturned?: number | undefined;
  readonly itemsConsidered?: number | undefined;
  readonly itemsUsed?: number | undefined;
  readonly factsConsidered?: number | undefined;
  readonly factsUsed?: number | undefined;
  readonly sourceRefsTotal?: number | undefined;
  readonly sourceRefsReturned?: number | undefined;
};

export type SummaryMemoryStaleMarkers = {
  readonly supersededFactsConsidered?: number | undefined;
  readonly supersededFactsUsed?: number | undefined;
  readonly staleFactsConsidered?: number | undefined;
  readonly staleFactsUsed?: number | undefined;
  readonly staleVectorDropCount?: number | undefined;
  readonly staleGraphDropCount?: number | undefined;
  readonly staleRagDropCount?: number | undefined;
};

export type SummaryMemorySupport = {
  readonly status?: string | undefined;
  readonly itemsReturned?: number | undefined;
  readonly warnings?: readonly string[] | undefined;
};

export type SummaryMemoryContext = {
  readonly status: SummaryMemoryStatus;
  readonly renderedText?: string | undefined;
  readonly sourceRefs?: readonly SummaryMemorySourceRef[] | undefined;
  readonly retrieval?: SummaryMemoryRetrieval | undefined;
  readonly staleMarkers?: SummaryMemoryStaleMarkers | undefined;
  readonly support?: SummaryMemorySupport | undefined;
  readonly diagnostics: SummaryMemoryDiagnostics;
  readonly retrievedAt: Date;
};

export type BuildSummaryMemoryContextQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly userId?: string | undefined;
  readonly subscriptionId?: string | undefined;
  readonly evidence: SummaryEvidenceSelection;
  readonly requestedAt: Date;
};

export type RecordSummaryFeedbackMemoryCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
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
        interestId: query.interestId,
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
