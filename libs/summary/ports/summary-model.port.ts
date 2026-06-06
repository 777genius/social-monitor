import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SummaryArtifactProps, SummaryLineage, SummaryUsage } from '../domain';
import type { SummaryEvidenceSelection } from './summary-evidence-selector.port';

export type SummaryModelRoute = {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly schemaVersion: 'summary.artifact.v1';
};

export type SummaryModelPolicy = {
  readonly preferredProvider: string;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly maxEstimatedCostUsd: number;
};

export type SummaryModelBudget = {
  readonly remainingTokens: number;
  readonly remainingCostUsd: number;
};

export type SummaryModelInput = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly evidence: SummaryEvidenceSelection;
  readonly requestedAt: Date;
};

export type SummaryModelEstimate = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number;
};

export type GeneratedSummaryDraft = Omit<
  SummaryArtifactProps,
  'schemaVersion' | 'summaryId' | 'tenantId' | 'workspaceId' | 'topicId' | 'sourceWindow'
> & {
  readonly lineage: SummaryLineage;
  readonly usage: SummaryUsage;
};

export type ProviderSummaryAttempt = {
  readonly route: SummaryModelRoute;
  readonly draft: GeneratedSummaryDraft;
};

export type SummaryModelFailureKind =
  | 'budget_exceeded'
  | 'provider_rate_limited'
  | 'provider_unavailable'
  | 'invalid_schema'
  | 'citation_validation_failed'
  | 'context_too_large'
  | 'unsafe_or_refused'
  | 'unknown';

export type SummaryModelFailure = {
  readonly kind: SummaryModelFailureKind;
  readonly retryable: boolean;
  readonly message: string;
};

export type SummaryModelValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: SummaryModelFailure };

export interface SummaryModelPort {
  route(input: SummaryModelInput, policy: SummaryModelPolicy, budget: SummaryModelBudget): SummaryModelRoute;
  estimate(input: SummaryModelInput, route: SummaryModelRoute): SummaryModelEstimate;
  summarize(input: SummaryModelInput, route: SummaryModelRoute): Promise<ProviderSummaryAttempt>;
  validateRawProviderResponse(attempt: ProviderSummaryAttempt): SummaryModelValidationResult;
  classifyError(error: unknown): SummaryModelFailure;
}
