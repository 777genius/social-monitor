import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type {
  BriefingContextArtifact,
  BriefingGenerationPolicy,
  BriefingLineage,
  BriefingScope,
  BriefingUsage,
  BriefingEvidenceSelection,
  GeneratedBriefingDraft,
} from '../domain';

export type BriefingModelRoute = {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly schemaVersion: 'briefing.artifact.v1';
};

export type BriefingModelPolicy = {
  readonly preferredProvider: string;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly maxEstimatedCostUsd: number;
};

export type BriefingModelBudget = {
  readonly remainingTokens: number;
  readonly remainingCostUsd: number;
};

export type BriefingModelInput = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: BriefingScope;
  readonly userId?: string;
  readonly subscriptionId?: string;
  readonly evidence: BriefingEvidenceSelection;
  readonly contextArtifacts: readonly BriefingContextArtifact[];
  readonly policy: BriefingGenerationPolicy;
  readonly requestedAt: Date;
};

export type BriefingModelEstimate = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number;
};

export type ProviderBriefingAttempt = {
  readonly route: BriefingModelRoute;
  readonly draft: GeneratedBriefingDraft & {
    readonly lineage: BriefingLineage;
    readonly usage: BriefingUsage;
  };
};

export type BriefingModelFailureKind =
  | 'budget_exceeded'
  | 'provider_rate_limited'
  | 'provider_unavailable'
  | 'invalid_schema'
  | 'citation_validation_failed'
  | 'context_too_large'
  | 'unsafe_or_refused'
  | 'unknown';

export type BriefingModelFailure = {
  readonly kind: BriefingModelFailureKind;
  readonly retryable: boolean;
  readonly message: string;
};

export type BriefingModelValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: BriefingModelFailure };

export interface BriefingModelPort {
  route(input: BriefingModelInput, policy: BriefingModelPolicy, budget: BriefingModelBudget): BriefingModelRoute;
  estimate(input: BriefingModelInput, route: BriefingModelRoute): BriefingModelEstimate;
  generate(input: BriefingModelInput, route: BriefingModelRoute): Promise<ProviderBriefingAttempt>;
  validateRawProviderResponse(attempt: ProviderBriefingAttempt): BriefingModelValidationResult;
  classifyError(error: unknown): BriefingModelFailure;
}
