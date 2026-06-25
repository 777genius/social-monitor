import type {
  BriefingNextAction,
  BriefingReaderItemConfidence,
  BriefingReaderItem,
} from '../entities/briefing-artifact';
import type {
  BriefingEvidenceItem,
  StoryCluster,
} from '../value-objects/briefing-evidence-item';
import { providerLabel, plural } from './briefing-reader-labels';

export {
  formatProviderMetrics,
  formatStoryProviderMetrics,
} from './briefing-provider-metrics-formatting';
export { providerLabel, plural } from './briefing-reader-labels';

export const buildMatchedRules = (
  evidence: readonly BriefingEvidenceItem[],
  topicIds: readonly string[],
  providerKey: string,
): readonly string[] => {
  const explicitRules = evidence.flatMap((item) => item.matchedRules ?? []);
  const fallbackRules = [
    ...topicIds.map((topicId) => `topic:${topicId}`),
    ...evidence.map((item) => `source-binding:${item.sourceBindingId}`),
    `provider:${providerKey}`,
  ];

  return compactUnique([...explicitRules, ...fallbackRules]);
};

export const buildWhyNow = (
  cluster: StoryCluster | undefined,
  providerKeys: readonly string[],
  evidence: readonly BriefingEvidenceItem[],
): string => {
  const providers = uniqueNonEmpty([
    ...(cluster?.providerKeys ?? []),
    ...providerKeys,
    ...evidence.map((item) => item.providerKey),
  ]).map(providerLabel);
  const duplicateCount = cluster?.duplicateFeedItemIds.length ?? 0;
  const topicCount =
    cluster?.topicIds.length ??
    uniqueNonEmpty(evidence.map((item) => item.topicId)).length;
  const coverage =
    providers.length > 1
      ? `Current summary window has cross-source coverage from ${providers.slice(0, 3).join(', ')}`
      : `Current summary window has ${providers[0] ?? 'source'} coverage`;
  const duplicateText =
    duplicateCount === 0
      ? ''
      : ` and clustered ${duplicateCount} related item${plural(duplicateCount)}`;
  const topicText = topicCount > 1 ? ` across ${topicCount} topics` : '';

  return `${coverage}${topicText}${duplicateText}.`;
};

export const normalizeSignalScore = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Number(value.toFixed(3)) : 0;

export const confirmedProviderKeys = (params: {
  readonly cluster: StoryCluster | undefined;
  readonly evidence: readonly BriefingEvidenceItem[];
  readonly providerKey: string;
}): readonly string[] => {
  const providerKeys = uniqueNonEmpty([
    ...(params.cluster?.providerKeys ?? []),
    ...params.evidence.map((item) => item.providerKey),
    params.providerKey,
  ]);

  return providerKeys.length > 0 ? providerKeys : [params.providerKey];
};

export const readerItemConfidence = (params: {
  readonly cluster: StoryCluster | undefined;
  readonly evidenceCount: number;
  readonly confirmedProviderCount: number;
  readonly signalScore: number;
}): BriefingReaderItemConfidence => {
  const breakdown = params.cluster?.signalBreakdown;
  const crossProviderSupport = breakdown?.crossProviderSupport ?? 0;
  const providerDiversityBoost = breakdown?.providerDiversityBoost ?? 0;
  const sameProviderSupport = breakdown?.sameProviderSupport ?? 0;
  const evidenceSupport = params.evidenceCount > 1 ? 0.08 : 0;
  const normalizedSignal = Math.min(params.signalScore / 4, 0.42);
  const confirmationSupport =
    params.confirmedProviderCount > 1
      ? Math.min(crossProviderSupport + providerDiversityBoost, 0.38)
      : Math.min(sameProviderSupport, 0.12);
  const score = clamp01(
    0.18 + normalizedSignal + confirmationSupport + evidenceSupport,
  );
  const level =
    score >= 0.72 && params.confirmedProviderCount > 1
      ? 'high'
      : score >= 0.46
        ? 'medium'
        : 'low';
  const rationale =
    params.confirmedProviderCount > 1
      ? `${params.confirmedProviderCount} providers confirm this story signal.`
      : params.evidenceCount > 1
        ? `${params.evidenceCount} source items support this story, but from one provider.`
        : 'Single-source story signal; treat provider metrics as local evidence.';

  return {
    level,
    score: Number(score.toFixed(2)),
    rationale,
  };
};

export const uniqueActions = (
  actions: readonly BriefingNextAction[],
): readonly BriefingNextAction[] => {
  const seen = new Set<string>();

  return actions.filter((action) => {
    const key = `${action.kind}:${action.label}:${action.canonicalUrl ?? ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const firstSentence = (value: string): string | undefined => {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const match = /^(.+?[.!?])(?:\s|$)/.exec(trimmed);
  return match?.[1] ?? trimmed;
};

export const hasAnyCitation = (
  left: readonly string[],
  right: readonly string[],
): boolean => left.some((citationId) => right.includes(citationId));

export const uniqueItems = (
  items: readonly BriefingReaderItem[],
): readonly BriefingReaderItem[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.providerKey}:${item.title}:${item.citationIds.join(',')}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const uniqueNonEmpty = (
  values: readonly string[],
): readonly string[] => {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      if (value.length === 0 || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
};

export const compactUnique = (
  values: readonly (string | undefined)[],
): readonly string[] =>
  uniqueNonEmpty(
    values.filter((value): value is string => value !== undefined),
  );

export const nonEmpty = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  return trimmed.length === 0 ? fallback : trimmed;
};

export const topicTitle = (topicId: string): string =>
  topicId
    .split(/[-_:\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');

const clamp01 = (value: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
