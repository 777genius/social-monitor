export type BetaLaunchMode = 'api_operator_beta';

export type KnownLimitationSeverity = 'notice' | 'degraded' | 'blocked';

export type PostMvpBacklogClassification =
  | 'blocker'
  | 'accepted_mvp_gap'
  | 'evidence_based_opportunity'
  | 'deferred_idea';

export type BetaKnownLimitation = {
  readonly limitationId: string;
  readonly severity: KnownLimitationSeverity;
  readonly title: string;
  readonly userImpact: string;
  readonly supportAction: string;
  readonly owner: string;
  readonly revisitTrigger: string;
};

export type PostMvpBacklogItem = {
  readonly itemId: string;
  readonly classification: PostMvpBacklogClassification;
  readonly title: string;
  readonly evidence: string;
  readonly owner: string;
  readonly architectureGuardrail: string;
  readonly revisitTrigger: string;
};

export type BetaLaunchSupportSnapshot = {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly publishedAt: string;
  readonly launchMode: BetaLaunchMode;
  readonly supportedSources: readonly string[];
  readonly deferredSources: readonly string[];
  readonly knownLimitations: readonly BetaKnownLimitation[];
  readonly postMvpBacklog: readonly PostMvpBacklogItem[];
};
