import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryArtifact,
  ReaderSummaryCadence,
  ReaderSummaryPeriod,
  ReaderSummaryPublicationDecision,
  ReaderSummaryScope,
} from "../domain";

export type ListReaderSummaryArtifactsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope?: ReaderSummaryScope;
  readonly cadence?: ReaderSummaryCadence;
  readonly periodStartedAt?: Date;
  readonly periodStartedFrom?: Date;
  readonly periodStartedBefore?: Date;
  readonly periodEndedAt?: Date;
  readonly timezone?: string;
  readonly limit: number;
  readonly cursor?: string;
};

export type ListReaderSummaryArtifactsResult = {
  readonly items: readonly ReaderSummaryArtifact[];
  readonly nextCursor?: string;
};

export type ReaderSummaryPeriodSummary = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly readerSummaryId: string;
  readonly scope: ReaderSummaryScope;
  readonly period: ReaderSummaryPeriod;
  readonly headline: string;
  readonly status: "completed" | "no_signal";
  readonly userId?: string;
  readonly subscriptionId?: string;
};

export type ListReaderSummaryPeriodSummariesResult = {
  readonly items: readonly ReaderSummaryPeriodSummary[];
  readonly nextCursor?: string;
};

export type ReaderSummaryRejectedArtifactDebug = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly readerSummaryId: string;
  readonly scope: ReaderSummaryScope;
  readonly period: ReaderSummaryPeriod;
  readonly headline: string;
  readonly canonicalScore: number;
  readonly shadow: {
    readonly mode: "shadow";
    readonly riskScore: number;
    readonly signals: readonly {
      readonly code: string;
      readonly score: number;
      readonly reason: string;
    }[];
  };
  readonly reasonCodes: readonly string[];
  readonly reasons: readonly string[];
  readonly violations: readonly {
    readonly code: string;
    readonly reason: string;
    readonly topReadTitle?: string;
    readonly citationId?: string;
    readonly feedItemId?: string;
    readonly sourceItemId?: string;
    readonly providerKey?: string;
    readonly canonicalUrl?: string;
  }[];
  readonly topReads: readonly {
    readonly title: string;
    readonly providerKey?: string;
    readonly canonicalUrl?: string;
    readonly citationIds: readonly string[];
  }[];
  readonly citations: readonly {
    readonly citationId: string;
    readonly feedItemId: string;
    readonly sourceItemId: string;
    readonly providerKey: string;
    readonly canonicalUrl?: string;
  }[];
};

export interface ReaderSummaryArtifactRepositoryPort {
  save(
    artifact: ReaderSummaryArtifact,
    options?: {
      readonly publicationDecision?: ReaderSummaryPublicationDecision;
      readonly generationRequestedAt?: Date;
    },
  ): Promise<void>;
  list(
    query: ListReaderSummaryArtifactsQuery,
  ): Promise<ListReaderSummaryArtifactsResult>;
  listPeriodSummaries(
    query: ListReaderSummaryArtifactsQuery,
  ): Promise<ListReaderSummaryPeriodSummariesResult>;
  findById(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly readerSummaryId: string;
  }): Promise<ReaderSummaryArtifact | null>;
  findRejectedDebugById(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly readerSummaryId: string;
  }): Promise<ReaderSummaryRejectedArtifactDebug | null>;
}
