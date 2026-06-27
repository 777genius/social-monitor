import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type {
  GeneratedReaderSummaryDraft,
  ReaderSummaryContextArtifact,
  ReaderSummaryGenerationPolicy,
  ReaderSummaryLineage,
  ReaderSummaryPeriod,
  ReaderSummaryScope,
  ReaderSummaryUsage,
  SummaryEvidenceSelection,
} from "../domain";

export type ReaderSummaryModelRoute = {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly schemaVersion: "reader_summary.artifact.v1";
};

export type ReaderSummaryModelPolicy = {
  readonly preferredProvider: string;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly maxEstimatedCostUsd: number;
};

export type ReaderSummaryModelBudget = {
  readonly remainingTokens: number;
  readonly remainingCostUsd: number;
};

export type ReaderSummaryModelInput = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
  readonly period: ReaderSummaryPeriod;
  readonly userId?: string;
  readonly subscriptionId?: string;
  readonly evidence: SummaryEvidenceSelection;
  readonly contextArtifacts: readonly ReaderSummaryContextArtifact[];
  readonly policy: ReaderSummaryGenerationPolicy;
  readonly requestedAt: Date;
};

export type ReaderSummaryModelEstimate = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number;
};

export type ProviderReaderSummaryAttempt = {
  readonly route: ReaderSummaryModelRoute;
  readonly draft: GeneratedReaderSummaryDraft & {
    readonly lineage: ReaderSummaryLineage;
    readonly usage: ReaderSummaryUsage;
  };
};

export type ReaderSummaryModelFailureKind =
  | "budget_exceeded"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "invalid_schema"
  | "citation_validation_failed"
  | "context_too_large"
  | "unsafe_or_refused"
  | "unknown";

export type ReaderSummaryModelFailure = {
  readonly kind: ReaderSummaryModelFailureKind;
  readonly retryable: boolean;
  readonly message: string;
};

export type ReaderSummaryModelValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: ReaderSummaryModelFailure };

export interface ReaderSummaryModelPort {
  route(
    input: ReaderSummaryModelInput,
    policy: ReaderSummaryModelPolicy,
    budget: ReaderSummaryModelBudget,
  ): ReaderSummaryModelRoute;
  estimate(
    input: ReaderSummaryModelInput,
    route: ReaderSummaryModelRoute,
  ): ReaderSummaryModelEstimate;
  generate(
    input: ReaderSummaryModelInput,
    route: ReaderSummaryModelRoute,
  ): Promise<ProviderReaderSummaryAttempt>;
  validateRawProviderResponse(
    attempt: ProviderReaderSummaryAttempt,
  ): ReaderSummaryModelValidationResult;
  classifyError(error: unknown): ReaderSummaryModelFailure;
}
