import type { Clock } from '@social-monitor/shared-kernel';

import type {
  BriefingEvidenceItem,
  BriefingEvidenceSelection,
  BriefingSourceWindow,
  StoryCluster,
} from '../value-objects/briefing-evidence-item';
import type { BriefingScopeIdentity } from '../value-objects/briefing-scope';
import { briefingScopeKey } from '../value-objects/briefing-scope';

export class StoryClusteringService {
  constructor(private readonly clock: Clock) {}

  cluster(params: {
    readonly identity: BriefingScopeIdentity;
    readonly items: readonly BriefingEvidenceItem[];
    readonly limit: number;
  }): BriefingEvidenceSelection {
    const limit = normalizeLimit(params.limit);
    const clusters = [...buildClusters(params.items)]
      .sort(compareStoryClusters)
      .slice(0, limit);
    const selectedEvidence = clusters
      .map((cluster) => params.items.find((item) => item.feedItemId === cluster.representativeFeedItemId))
      .filter((item): item is BriefingEvidenceItem => item !== undefined);

    return {
      sourceWindow: buildSourceWindow(params.identity, clusters, selectedEvidence, this.clock),
      clusters,
      selectedEvidence,
    };
  }
}

const buildClusters = (items: readonly BriefingEvidenceItem[]): readonly StoryCluster[] => {
  const groups = new Map<string, BriefingEvidenceItem[]>();

  for (const item of items) {
    const key = storyKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return [...groups.entries()].map(([key, clusterItems]) => {
    const sorted = [...clusterItems].sort(compareEvidenceItems);
    const representative = sorted[0];
    if (representative === undefined) {
      throw new Error('Briefing story cluster must contain evidence');
    }
    const observedTimes = sorted.map((item) => item.observedAt.getTime());

    return {
      id: `story:${key}`,
      storyKey: key,
      representativeFeedItemId: representative.feedItemId,
      duplicateFeedItemIds: sorted
        .slice(1)
        .map((item) => item.feedItemId),
      topicIds: uniqueSorted(sorted.map((item) => item.topicId)),
      providerKeys: uniqueSorted(sorted.map((item) => item.providerKey)),
      score: representative.score,
      observedAtRange: {
        startedAt: new Date(Math.min(...observedTimes)),
        endedAt: new Date(Math.max(...observedTimes) + 1),
      },
      whyImportant: uniqueStable(sorted.flatMap((item) => item.whyImportant)),
    } satisfies StoryCluster;
  });
};

const buildSourceWindow = (
  identity: BriefingScopeIdentity,
  clusters: readonly StoryCluster[],
  selectedEvidence: readonly BriefingEvidenceItem[],
  clock: Clock,
): BriefingSourceWindow => {
  if (clusters.length === 0 || selectedEvidence.length === 0) {
    const endedAt = clock.now();
    const startedAt = new Date(endedAt.getTime() - 1);

    return {
      windowId: `${identity.tenantId}:${identity.workspaceId}:${briefingScopeKey(identity.scope)}:empty`,
      startedAt,
      endedAt,
      selectedFeedItemIds: [],
      storyClusterIds: [],
    };
  }

  const observedTimes = selectedEvidence.map((item) => item.observedAt.getTime());
  const startedAt = new Date(Math.min(...observedTimes));
  const endedAtValue = Math.max(...observedTimes);
  const endedAt = new Date(endedAtValue > startedAt.getTime() ? endedAtValue : endedAtValue + 1);

  return {
    windowId: [
      identity.tenantId,
      identity.workspaceId,
      briefingScopeKey(identity.scope),
      startedAt.toISOString(),
      endedAt.toISOString(),
    ].join(':'),
    startedAt,
    endedAt,
    selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
    storyClusterIds: clusters.map((cluster) => cluster.id),
  };
};

const storyKey = (item: BriefingEvidenceItem): string => {
  const storyKeyHint = item.storyKeyHint?.trim();
  if (storyKeyHint !== undefined && storyKeyHint.length > 0) {
    return storyKeyHint;
  }

  const canonicalUrlKey = canonicalUrlStoryKey(item.canonicalUrl);
  if (canonicalUrlKey !== null) {
    return canonicalUrlKey;
  }

  if (item.sourceItemId.trim().length > 0) {
    return `source:${item.providerKey}:${item.sourceItemId}`;
  }

  return `title:${titleFingerprint(item.title)}`;
};

const canonicalUrlStoryKey = (value: string): string | null => {
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    parsed.search = '';
    parsed.hostname = parsed.hostname.toLocaleLowerCase('en-US');

    return `url:${parsed.hostname}${parsed.pathname.replace(/\/+$/u, '')}`;
  } catch {
    return null;
  }
};

const titleFingerprint = (value: string): string =>
  value
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{Letter}\p{Number}\s]+/gu, ' ')
    .split(/\s+/u)
    .filter((token) => token.length > 2)
    .slice(0, 10)
    .join('-') || 'untitled';

const compareEvidenceItems = (left: BriefingEvidenceItem, right: BriefingEvidenceItem): number => {
  const scoreDiff = right.score - left.score;
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  return right.observedAt.getTime() - left.observedAt.getTime();
};

const compareStoryClusters = (left: StoryCluster, right: StoryCluster): number => {
  const topicCoverageDiff = right.topicIds.length - left.topicIds.length;
  if (topicCoverageDiff !== 0) {
    return topicCoverageDiff;
  }

  const scoreDiff = right.score - left.score;
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  return right.observedAtRange.endedAt.getTime() - left.observedAtRange.endedAt.getTime();
};

const uniqueSorted = (values: readonly string[]): readonly string[] => [...new Set(values)].sort();

const uniqueStable = (values: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
};

const normalizeLimit = (value: number): number => {
  if (!Number.isInteger(value) || value < 1) {
    return 1;
  }

  return Math.min(value, 50);
};
