import type { ReaderAction } from "../entities/reader-action";
import type { TopRead, TopReadConfidence } from "../entities/top-read";
import type { ProviderMetric } from "../value-objects/provider-metric-label";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import {
  clampConfidenceScore,
  normalizeSignalScore,
} from "../value-objects/signal-score";
import {
  compactUnique,
  firstSentence,
  nonEmpty,
  plural,
  topicTitle,
  uniqueNonEmpty,
} from "../value-objects/summary-text";

export { plural } from "../value-objects/summary-text";

export const buildMatchedRules = (
  evidence: readonly SummaryEvidenceItem[],
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
  evidence: readonly SummaryEvidenceItem[],
): string => {
  const providerNamesByKey = new Map(
    evidence.map(
      (item) =>
        [item.providerKey, item.providerName ?? item.providerKey] as const,
    ),
  );
  const providers = uniqueNonEmpty([
    ...(cluster?.providerKeys ?? []),
    ...providerKeys,
    ...evidence.map((item) => item.providerKey),
  ]).map((providerKey) => providerNamesByKey.get(providerKey) ?? providerKey);
  const duplicateCount = cluster?.duplicateFeedItemIds.length ?? 0;
  const topicCount =
    cluster?.topicIds.length ??
    uniqueNonEmpty(evidence.map((item) => item.topicId)).length;
  const coverage =
    providers.length > 1
      ? `Current summary window has cross-source coverage from ${providers.slice(0, 3).join(", ")}`
      : `Current summary window has ${providers[0] ?? "source"} coverage`;
  const duplicateText =
    duplicateCount === 0
      ? ""
      : ` and clustered ${duplicateCount} related item${plural(duplicateCount)}`;
  const topicText = topicCount > 1 ? ` across ${topicCount} topics` : "";

  return `${coverage}${topicText}${duplicateText}.`;
};

export { normalizeSignalScore };

export const confirmedProviderKeys = (params: {
  readonly cluster: StoryCluster | undefined;
  readonly evidence: readonly SummaryEvidenceItem[];
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
}): TopReadConfidence => {
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
  const score = clampConfidenceScore(
    0.18 + normalizedSignal + confirmationSupport + evidenceSupport,
  );
  const level =
    score >= 0.72 && params.confirmedProviderCount > 1
      ? "high"
      : score >= 0.46
        ? "medium"
        : "low";
  const rationale =
    params.confirmedProviderCount > 1
      ? `${params.confirmedProviderCount} providers confirm this story signal.`
      : params.evidenceCount > 1
        ? `${params.evidenceCount} source items support this story, but from one provider.`
        : "Single-source story signal; treat provider metrics as local evidence.";

  return {
    level,
    score: Number(score.toFixed(2)),
    rationale,
  };
};

export const storyProviderMetricLabels = (params: {
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly representativeMetricLabels: readonly ProviderMetric[] | undefined;
}): readonly ProviderMetric[] => {
  return uniqueMetrics([
    ...params.evidence.slice(0, 3).flatMap(evidenceProviderMetrics),
    ...(params.representativeMetricLabels ?? []),
  ]);
};

const evidenceProviderMetrics = (
  evidence: SummaryEvidenceItem,
): readonly ProviderMetric[] => {
  const metrics = evidence.providerMetricLabels ?? [];
  const summary =
    evidence.providerMetricSummary === undefined
      ? []
      : [
          {
            label: `${evidence.providerName ?? evidence.providerKey} evidence`,
            value: evidence.providerMetricSummary,
          },
        ];

  return [...summary, ...metrics];
};

const uniqueMetrics = (
  metrics: readonly ProviderMetric[],
): readonly ProviderMetric[] => {
  const seen = new Set<string>();
  const result: ProviderMetric[] = [];

  for (const metric of metrics) {
    const key = `${metric.label}:${metric.value}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(metric);
  }

  return result;
};

export const uniqueActions = (
  actions: readonly ReaderAction[],
): readonly ReaderAction[] => {
  const seen = new Set<string>();

  return actions.filter((action) => {
    const key = `${action.kind}:${action.label}:${action.canonicalUrl ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export { firstSentence };

export const hasAnyCitation = (
  left: readonly string[],
  right: readonly string[],
): boolean => left.some((citationId) => right.includes(citationId));

export const uniqueItems = (items: readonly TopRead[]): readonly TopRead[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.providerKey}:${item.title}:${item.citationIds.join(",")}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export { uniqueNonEmpty };

export { compactUnique };

export { nonEmpty };

export { topicTitle };
