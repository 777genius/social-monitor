import type { SourceBindingConfig } from "../../ports";
import type { InterestView } from "../shared/interest-presenter";

export type InterestCoveragePlanDraftStatus =
  "ready" | "needs_input" | "already_bound" | "unsupported";

export type InterestCoveragePlanApplyTarget = {
  readonly method: "POST";
  readonly path: string;
  readonly requiredScope: "write:source_bindings";
};

export type InterestCoveragePlanBindingDraft = {
  readonly providerKey: string;
  readonly config: SourceBindingConfig;
};

export type InterestCoveragePlanAlternativeDraft = {
  readonly label: string;
  readonly config: SourceBindingConfig;
  readonly rationale: readonly string[];
};

export type InterestCoveragePlanCadenceSuggestion = {
  readonly intervalSeconds: number;
  readonly freshnessSeconds: number;
  readonly retryBudget: number;
};

export type InterestCoverageSourcePackProviderStarter = {
  readonly providerKey: string;
  readonly label: string;
  readonly keywords: readonly string[];
  readonly queries: readonly string[];
  readonly subreddits: readonly string[];
  readonly topics: readonly string[];
  readonly languages: readonly string[];
  readonly rssFeedUrls: readonly string[];
};

export type InterestCoverageSourcePackView = {
  readonly key: string;
  readonly displayName: string;
  readonly description: string;
  readonly providerStarters: readonly InterestCoverageSourcePackProviderStarter[];
};

export type InterestCoveragePlanDraft = {
  readonly providerKey: string;
  readonly displayName: string;
  readonly status: InterestCoveragePlanDraftStatus;
  readonly confidenceScore: number;
  readonly priority: number;
  readonly targetContentUnits: readonly string[];
  readonly queryModes: readonly string[];
  readonly rationale: readonly string[];
  readonly warnings: readonly string[];
  readonly sourceBindingDraft?: InterestCoveragePlanBindingDraft;
  readonly alternativeDrafts: readonly InterestCoveragePlanAlternativeDraft[];
  readonly applyTarget?: InterestCoveragePlanApplyTarget;
  readonly existingSourceBindingId?: string;
  readonly cadenceSuggestion?: InterestCoveragePlanCadenceSuggestion;
};

export type PlanInterestCoverageResult = {
  readonly interest: InterestView;
  readonly planningQuery: string;
  readonly normalizedKeywords: readonly string[];
  readonly sourcePack?: InterestCoverageSourcePackView;
  readonly drafts: readonly InterestCoveragePlanDraft[];
  readonly coverageGaps: readonly string[];
  readonly skippedProviders: readonly {
    readonly providerKey: string;
    readonly reason: string;
  }[];
};
