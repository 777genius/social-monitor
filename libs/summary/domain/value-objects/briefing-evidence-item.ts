import type { JsonObject } from '@social-monitor/shared-kernel';

export type BriefingEvidenceItem = {
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly topicId: string;
  readonly providerKey: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly bodyPreview?: string;
  readonly authorHandle?: string;
  readonly publishedAt: Date;
  readonly observedAt: Date;
  readonly score: number;
  readonly whyImportant: readonly string[];
  readonly providerMetrics?: JsonObject;
  readonly matchedRules?: readonly string[];
  readonly storyKeyHint?: string;
};

export type StoryCluster = {
  readonly id: string;
  readonly storyKey: string;
  readonly representativeFeedItemId: string;
  readonly duplicateFeedItemIds: readonly string[];
  readonly topicIds: readonly string[];
  readonly providerKeys: readonly string[];
  readonly score: number;
  readonly observedAtRange: {
    readonly startedAt: Date;
    readonly endedAt: Date;
  };
  readonly whyImportant: readonly string[];
};

export type BriefingEvidenceSelection = {
  readonly sourceWindow: BriefingSourceWindow;
  readonly clusters: readonly StoryCluster[];
  readonly selectedEvidence: readonly BriefingEvidenceItem[];
};

export type BriefingSourceWindow = {
  readonly windowId: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly selectedFeedItemIds: readonly string[];
  readonly storyClusterIds: readonly string[];
};
