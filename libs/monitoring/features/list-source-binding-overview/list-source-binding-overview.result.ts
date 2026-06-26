import type { GetSourceBindingHealthResult } from '../get-source-binding-health/get-source-binding-health.result';

export type SourceBindingOverviewProviderBreakdownView = {
  readonly providerKey: string;
  readonly totalBindings: number;
  readonly healthyBindings: number;
  readonly staleBindings: number;
  readonly degradedBindings: number;
  readonly scanningBindings: number;
  readonly pausedBindings: number;
  readonly notConfiguredBindings: number;
  readonly scheduledBindings: number;
  readonly canScanNowBindings: number;
  readonly freshSuccessSkips: number;
  readonly rateLimitBackoffSkips: number;
  readonly providerUnavailableScans: number;
  readonly nextEligibleAt?: string;
  readonly signals: readonly string[];
};

export type SourceBindingOverviewSummaryView = {
  readonly totalBindings: number;
  readonly healthyBindings: number;
  readonly staleBindings: number;
  readonly degradedBindings: number;
  readonly scanningBindings: number;
  readonly pausedBindings: number;
  readonly notConfiguredBindings: number;
  readonly scheduledBindings: number;
  readonly canScanNowBindings: number;
  readonly freshSuccessSkips: number;
  readonly rateLimitedBindings: number;
  readonly providerUnavailableScans: number;
  readonly attentionRequiredBindings: number;
  readonly nextEligibleAt?: string;
  readonly operatorAction: string;
  readonly signals: readonly string[];
  readonly providerBreakdown: readonly SourceBindingOverviewProviderBreakdownView[];
};

export type ListSourceBindingOverviewResult = {
  readonly summary: SourceBindingOverviewSummaryView;
  readonly items: readonly GetSourceBindingHealthResult[];
  readonly nextCursor?: string;
};
