import type { ProviderKey, SourceContentUnit, SourceCursorModel, SourceQuotaModel } from './source-provider.port';

export type SourceReadinessState =
  | 'research_only'
  | 'profiled'
  | 'certification_ready'
  | 'enabled_beta'
  | 'provider_only'
  | 'manual_only'
  | 'rejected';

export type SourceReadinessProfile = {
  readonly providerKey: ProviderKey;
  readonly state: SourceReadinessState;
  readonly acquisitionMode: string;
  readonly approvalOwner: string;
  readonly termsNotes: string;
  readonly credentialOwnership: string;
  readonly quotaModel: SourceQuotaModel;
  readonly retentionNotes: string;
  readonly cursorModel: SourceCursorModel;
  readonly identityStrategy: readonly string[];
  readonly supportedContentUnits: readonly SourceContentUnit[];
  readonly unsupportedContentUnits: readonly SourceContentUnit[];
  readonly estimatedCostPerScan: string;
  readonly betaEnablementCriteria: readonly string[];
  readonly rollbackPlan: string;
};
