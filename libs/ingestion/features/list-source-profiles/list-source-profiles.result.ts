import type {
  SourceReadinessFreshnessGuard,
  SourceReadinessState,
  SourceRuntimeReadiness,
  SourceLiveEvidenceRequirement,
} from '../../ports';

export type SourceProfileEntry = {
  readonly providerKey: string;
  readonly displayName?: string;
  readonly capabilityVersion?: number;
  readonly productionSafe: boolean;
  readonly readinessState: SourceReadinessState;
  readonly runtimeReadiness: SourceRuntimeReadiness;
  readonly liveBetaBlockers: readonly string[];
  readonly liveEvidenceRequirements: readonly SourceLiveEvidenceRequirement[];
  readonly freshnessGuard?: SourceReadinessFreshnessGuard;
  readonly acquisitionMode: string;
  readonly supportedContentUnits: readonly string[];
  readonly supportedQueryModes: readonly string[];
  readonly cursorModel: string;
  readonly quotaModel: string;
  readonly limitations: readonly string[];
};

export type ListSourceProfilesResult = {
  readonly sources: readonly SourceProfileEntry[];
};
