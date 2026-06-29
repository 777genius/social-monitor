import type { ReaderAction } from "../entities/reader-action";
import type { SourceMixEntry } from "../entities/source-mix-entry";
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
  interestTitle,
  uniqueNonEmpty,
} from "../value-objects/summary-text";

export { plural } from "../value-objects/summary-text";

export const buildMatchedRules = (
  evidence: readonly SummaryEvidenceItem[],
  interestIds: readonly string[],
  providerKey: string,
): readonly string[] => {
  const explicitRules = evidence.flatMap((item) => item.matchedRules ?? []);
  const fallbackRules = [
    ...interestIds.map((interestId) => `interest:${interestId}`),
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
  const interestCount =
    cluster?.interestIds.length ??
    uniqueNonEmpty(evidence.map((item) => item.interestId)).length;
  const coverage =
    providers.length > 1
      ? `Current summary window has cross-source coverage from ${providers.slice(0, 3).join(", ")}`
      : `Current summary window has ${providers[0] ?? "source"} coverage`;
  const duplicateText =
    duplicateCount === 0
      ? ""
      : ` and clustered ${duplicateCount} related item${plural(duplicateCount)}`;
  const interestText = interestCount > 1 ? ` across ${interestCount} interests` : "";

  return `${coverage}${interestText}${duplicateText}.`;
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
  const rawScore = clampConfidenceScore(
    0.18 + normalizedSignal + confirmationSupport + evidenceSupport,
  );
  const score =
    params.confirmedProviderCount > 1
      ? rawScore
      : Math.min(rawScore, params.evidenceCount > 1 ? 0.55 : 0.42);
  const level =
    score >= 0.72 && params.confirmedProviderCount > 1
      ? "high"
      : score >= 0.5
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

export const groundedReaderHeadline = (params: {
  readonly headline: string;
  readonly sourceMix: readonly SourceMixEntry[];
  readonly topReads: readonly TopRead[];
}): string => {
  const fallback = nonEmpty(params.headline, "Workspace summary");

  if (params.topReads.length === 0) {
    return fallback;
  }

  const hasCrossProviderEvidence =
    params.sourceMix.some((source) => source.crossSourceClusterCount > 0) ||
    params.topReads.some((item) => item.confirmedProviderKeys.length > 1);
  const safeSemanticHeadline =
    !isTechnicalReaderHeadline(fallback) &&
    (hasCrossProviderEvidence || !isUnconfirmedModelClaimText(fallback));

  if (safeSemanticHeadline) {
    return fallback;
  }

  const providerNames = uniqueNonEmpty(
    params.sourceMix.length === 0
      ? params.topReads.map((item) => item.providerName)
      : params.sourceMix.map((source) =>
          providerNameForSource(source.providerKey, params.topReads),
        ),
  );
  const providerLabel =
    providerNames.length === 0
      ? "monitored sources"
      : providerNames.length === 1
        ? (providerNames[0] ?? "monitored sources")
        : `${providerNames.slice(0, 3).join(", ")}${
            providerNames.length > 3 ? ` +${providerNames.length - 3}` : ""
          }`;
  return buildHumanReaderHeadline(params.topReads) ?? `${providerLabel} summary`;
};

export const buildGroundedOneLineTakeaway = (params: {
  readonly executiveSummary: string;
  readonly topReads: readonly TopRead[];
  readonly sourceMix: readonly SourceMixEntry[];
}): string => {
  const fallback =
    firstSentence(params.executiveSummary) ??
    params.topReads[0]?.reason ??
    "Review the latest monitored signals.";

  if (
    params.topReads.length === 0 ||
    (!isTechnicalReaderHeadline(fallback) &&
      !isUnconfirmedModelClaimText(fallback))
  ) {
    return fallback;
  }

  const topReadCount = params.topReads.length;
  const leadReads = params.topReads
    .slice(0, 3)
    .map(sourceLocalReadLabel)
    .filter((label) => label.length > 0);
  const lead =
    leadReads.length === 0
      ? `${topReadCount} monitored read${plural(topReadCount)} need${topReadCount === 1 ? "s" : ""} confirmation.`
      : `${leadReads.join("; ")}.`;

  return [
    lead,
    "Confirm important claims with another monitored source before acting.",
  ].join(" ");
};

export const buildBestFirstReadBullet = (topRead: TopRead): string => {
  const citationCount = topRead.citationIds.length;
  const citationLabel =
    citationCount === 1 ? "1 citation" : `${citationCount} citations`;
  const isSingleProvider = topRead.confirmedProviderKeys.length <= 1;

  if (isSingleProvider) {
    return [
      `Best first cited read from ${topRead.providerName} (${citationLabel}):`,
      `${topRead.title} - needs confirmation; verify citations in Top reads.`,
    ].join(" ");
  }

  return [
    `Best first read (${citationLabel}, ${topRead.confirmedProviderKeys.length} providers):`,
    `${topRead.title} - ${topRead.reason}`,
  ].join(" ");
};

const providerNameForSource = (
  providerKey: string,
  topReads: readonly TopRead[],
): string =>
  topReads.find((item) => item.providerKey === providerKey)?.providerName ??
  providerLabelForKey(providerKey);

const providerLabelForKey = (providerKey: string): string => {
  switch (providerKey.toLowerCase()) {
    case "github-trending-page":
      return "GitHub Trending";
    case "github-repo-radar":
      return "Repo Radar";
    case "github-issues":
    case "github":
      return "GitHub";
    case "hacker-news":
    case "hn":
      return "Hacker News";
    case "reddit":
      return "Reddit";
    case "rss":
      return "RSS";
    case "x-twitter":
    case "twitter":
      return "X/Twitter";
    default:
      return providerKey;
  }
};

const sourceLocalReadLabel = (read: TopRead): string => {
  const reason = [read.reason, ...read.whyImportant].find(
    (value) => !isWeakReaderReason(value),
  );
  const value = reason ?? `source-reported ${read.title}`;

  return stripTrailingPeriod(value);
};

const isWeakReaderReason = (value: string): boolean => {
  const lower = value.trim().toLowerCase();

  return (
    lower.length === 0 ||
    lower.startsWith("story signal score") ||
    lower.startsWith("current summary window has") ||
    lower.includes("citation references bodypreview evidence") ||
    lower.includes("source item source-binding") ||
    lower.includes("bodypreview evidence from source item")
  );
};

const stripTrailingPeriod = (value: string): string => {
  const trimmed = value.trim();

  return trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
};

const isTechnicalReaderHeadline = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();

  return (
    normalized.length === 0 ||
    normalized.startsWith("key signals across") ||
    normalized.startsWith("strongest reads across") ||
    normalized.startsWith("strongest read across") ||
    normalized.startsWith("summary:") ||
    normalized.startsWith("source watch") ||
    normalized.includes("source watch across") ||
    normalized.includes("cited top read") ||
    [
      "review ",
      "check ",
      "read ",
      "use ",
      "treat ",
      "inspect ",
      "start with ",
    ].some((prefix) => normalized.startsWith(prefix))
  );
};

const isUnconfirmedModelClaimText = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();

  return (
    /\b(?:alleged|claim(?:s|ed)?|confirms?|confirmed|launch(?:es|ed)?|release(?:s|d)?|beats?|outperforms?|leadership|available|pricing|preview|rumou?r|ships?|announces?)\b/iu.test(
      normalized,
    ) &&
    /\b(?:gpt[-\s]?\d+(?:\.\d+)?|claude\s*\d+(?:\.\d+)?|gemini\s*\d+(?:\.\d+)?|benchmark|preview|model|pricing|availability|launch|release)\b/iu.test(
      normalized,
    )
  );
};

const buildHumanReaderHeadline = (
  topReads: readonly TopRead[],
): string | undefined => {
  const leadReads = topReads
    .slice(0, 3)
    .map((read) =>
      compactHeadlinePart(sourceLocalReadLabel(read) || read.title),
    )
    .filter((value) => value.length > 0);

  if (leadReads.length === 0) {
    return undefined;
  }

  return leadReads.join("; ");
};

const compactHeadlinePart = (value: string): string => {
  const sentence = firstSentence(value) ?? value;
  const compact = stripTrailingPeriod(sentence.replace(/\s+/gu, " "));
  const maxLength = 82;

  if (compact.length <= maxLength) {
    return compact;
  }

  const shortened = compact.slice(0, maxLength).replace(/\s+\S*$/u, "").trim();

  return shortened.length === 0 ? compact.slice(0, maxLength).trim() : shortened;
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

export { interestTitle };
