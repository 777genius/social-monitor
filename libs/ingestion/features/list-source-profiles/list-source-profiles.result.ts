import type {
  SourceContentUnit,
  SourceReadinessFreshnessGuard,
  SourceReadinessState,
  SourceRuntimeReadiness,
  SourceLiveEvidenceRequirement,
} from '../../ports';

export type SourceProfileHealthState =
  | 'healthy'
  | 'stale'
  | 'rate_limited'
  | 'auth_failed'
  | 'degraded'
  | 'unsupported_scope';

export type SourceProfileHealthExplanation = {
  readonly state: SourceProfileHealthState;
  readonly reasonCode: string;
  readonly message: string;
  readonly signals: readonly string[];
};

export type SourceProfileEntry = {
  readonly providerKey: string;
  readonly displayName?: string;
  readonly capabilityVersion?: number;
  readonly productionSafe: boolean;
  readonly health: SourceProfileHealthExplanation;
  readonly readinessState: SourceReadinessState;
  readonly runtimeReadiness: SourceRuntimeReadiness;
  readonly liveBetaBlockers: readonly string[];
  readonly liveEvidenceRequirements: readonly SourceLiveEvidenceRequirement[];
  readonly freshnessGuard?: SourceReadinessFreshnessGuard;
  readonly acquisitionMode: string;
  readonly supportedContentUnits: readonly string[];
  readonly unsupportedContentUnits: readonly SourceContentUnit[];
  readonly supportedQueryModes: readonly string[];
  readonly cursorModel: string;
  readonly quotaModel: string;
  readonly limitations: readonly string[];
};

export type ListSourceProfilesResult = {
  readonly sources: readonly SourceProfileEntry[];
};
